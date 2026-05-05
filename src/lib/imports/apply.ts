import { createHash, randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/server";

type JsonRecord = Record<string, unknown>;

type RawImportRow = {
  id: string;
  batch_id: string;
  row_number: number;
  normalized_payload: NormalizedPayload;
  row_hash: string | null;
  status: string;
};

type NormalizedPayload = {
  nombre?: string;
  apellidos?: string;
  monto_prestamo_autorizado?: number | null;
  empleador?: string;
  clabe?: string | null;
  banco?: string;
  curp?: string | null;
  rfc?: string | null;
  cp_csf?: string | null;
  telefono?: string;
  telefono_normalizado?: string | null;
  email?: string | null;
  estatus_p_esta_q?: string;
  estatus_conversion?: string;
  estatus_cliente?: string;
  is_eligible?: boolean;
};

type Employee = {
  id: string;
  rfc: string;
  curp: string | null;
  nombre: string;
  apellidos: string | null;
  cp_csf: string | null;
  telefono: string;
  telefono_normalizado: string;
  email: string | null;
  empleador: string | null;
};

type EmployeePayload = Omit<Employee, "id"> & {
  source_batch_id: string;
  source_row_id: string;
};

type BankAccount = {
  id: string;
  employee_id: string;
  clabe: string;
  banco: string;
};

type AdvanceOffer = {
  id: string;
  employee_id: string;
  monto_prestamo_autorizado: number;
  estatus_p_esta_q: string | null;
  estatus_conversion: string;
  estatus_cliente: string | null;
  is_current: boolean;
  status: string;
  source_hash: string | null;
};

type ApplyStats = {
  appliedRows: number;
  changedRows: number;
  unchangedRows: number;
  createdEmployees: number;
  updatedEmployees: number;
  createdOffers: number;
  replacedOffers: number;
};

export async function applyImportBatch(batchId: string) {
  const supabase = getSupabaseAdmin();
  const stats: ApplyStats = {
    appliedRows: 0,
    changedRows: 0,
    unchangedRows: 0,
    createdEmployees: 0,
    updatedEmployees: 0,
    createdOffers: 0,
    replacedOffers: 0,
  };

  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .select("id, status, valid_rows, invalid_rows, duplicate_rows")
    .eq("id", batchId)
    .single();

  if (batchError) {
    throw batchError;
  }

  if (!batch) {
    throw new Error("Importacion no encontrada.");
  }

  if (batch.status !== "validando") {
    throw new Error("Solo se pueden aplicar importaciones en estado validando.");
  }

  const rows = await getValidRows(batchId);

  if (rows.length === 0) {
    throw new Error("No hay filas validas para aplicar.");
  }

  for (const row of rows) {
    const normalized = row.normalized_payload;
    const employee = await upsertEmployee(row, normalized);
    const activeBankAccount = await getActiveBankAccount(employee.id);
    const bankChanged = await syncBankAccount(row, employee.id, activeBankAccount, normalized);
    const currentOffer = await getCurrentOffer(employee.id);
    const offerResult = await syncOffer(row, employee.id, currentOffer, normalized);
    const rowChanged = employee.__changed || bankChanged || offerResult.changed;

    if (employee.__created) {
      stats.createdEmployees += 1;
    }

    if (employee.__changed && !employee.__created) {
      stats.updatedEmployees += 1;
    }

    if (offerResult.created) {
      stats.createdOffers += 1;
    }

    if (offerResult.replaced) {
      stats.replacedOffers += 1;
    }

    if (rowChanged) {
      stats.changedRows += 1;
      stats.appliedRows += 1;
      await updateRowStatus(row.id, "aplicada");
    } else {
      stats.unchangedRows += 1;
      await updateRowStatus(row.id, "sin_cambios");
    }

    await createAuditEvent({
      event_name: rowChanged ? "import.row_applied" : "import.row_unchanged",
      entity_type: "raw_import_rows",
      entity_id: row.id,
      employee_id: employee.id,
      summary: rowChanged
        ? `Fila ${row.row_number} aplicada para RFC ${employee.rfc}.`
        : `Fila ${row.row_number} sin cambios para RFC ${employee.rfc}.`,
      metadata: {
        batch_id: batchId,
        row_number: row.row_number,
        row_hash: row.row_hash,
      },
    });
  }

  const finalStatus =
    batch.invalid_rows > 0 || batch.duplicate_rows > 0
      ? "aplicada_con_errores"
      : "aplicada";

  const { error: updateBatchError } = await supabase
    .from("import_batches")
    .update({
      status: finalStatus,
      applied_rows: stats.appliedRows,
      changed_rows: stats.changedRows,
      unchanged_rows: stats.unchangedRows,
      applied_at: new Date().toISOString(),
      metadata: {
        apply_stats: stats,
      },
    })
    .eq("id", batchId);

  if (updateBatchError) {
    throw updateBatchError;
  }

  await createAuditEvent({
    event_name: "import.applied",
    entity_type: "import_batches",
    entity_id: batchId,
    summary: `Importacion aplicada: ${stats.changedRows} cambios, ${stats.unchangedRows} sin cambios.`,
    metadata: stats,
  });

  return {
    batchId,
    status: finalStatus,
    ...stats,
  };
}

async function getValidRows(batchId: string) {
  const supabase = getSupabaseAdmin();
  const rows: RawImportRow[] = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("raw_import_rows")
      .select("id, batch_id, row_number, normalized_payload, row_hash, status")
      .eq("batch_id", batchId)
      .eq("status", "valida")
      .order("row_number", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw error;
    }

    rows.push(...((data ?? []) as RawImportRow[]));

    if (!data || data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return rows;
}

async function upsertEmployee(row: RawImportRow, normalized: NormalizedPayload) {
  const supabase = getSupabaseAdmin();
  const rfc = requireString(normalized.rfc, "RFC requerido.");
  const employeePayload = {
    rfc,
    curp: normalized.curp ?? null,
    nombre: requireString(normalized.nombre, "Nombre requerido."),
    apellidos: normalized.apellidos || null,
    cp_csf: normalized.cp_csf ?? null,
    telefono: requireString(normalized.telefono, "Telefono requerido."),
    telefono_normalizado: requireString(
      normalized.telefono_normalizado,
      "Telefono normalizado requerido.",
    ),
    email: normalized.email ?? null,
    empleador: normalized.empleador || null,
    source_batch_id: row.batch_id,
    source_row_id: row.id,
  };

  const { data: existing, error: existingError } = await supabase
    .from("employees")
    .select("id, rfc, curp, nombre, apellidos, cp_csf, telefono, telefono_normalizado, email, empleador")
    .eq("rfc", rfc)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (!existing) {
    const { data, error } = await supabase
      .from("employees")
      .insert(employeePayload)
      .select("id, rfc, curp, nombre, apellidos, cp_csf, telefono, telefono_normalizado, email, empleador")
      .single();

    if (error) {
      throw error;
    }

    await createAuditEvent({
      event_name: "employee.created",
      entity_type: "employees",
      entity_id: data.id,
      employee_id: data.id,
      summary: `Empleado creado por importacion: ${rfc}.`,
      metadata: { row_id: row.id, batch_id: row.batch_id },
    });

    return { ...(data as Employee), __created: true, __changed: true };
  }

  const changed = hasEmployeeChanged(existing as Employee, employeePayload);

  if (!changed) {
    return { ...(existing as Employee), __created: false, __changed: false };
  }

  const { data, error } = await supabase
    .from("employees")
    .update(employeePayload)
    .eq("id", existing.id)
    .select("id, rfc, curp, nombre, apellidos, cp_csf, telefono, telefono_normalizado, email, empleador")
    .single();

  if (error) {
    throw error;
  }

  await createAuditEvent({
    event_name: "employee.updated",
    entity_type: "employees",
    entity_id: data.id,
    employee_id: data.id,
    summary: `Empleado actualizado por importacion: ${rfc}.`,
    metadata: {
      row_id: row.id,
      batch_id: row.batch_id,
      previous: existing,
      next: employeePayload,
    },
  });

  return { ...(data as Employee), __created: false, __changed: true };
}

async function getActiveBankAccount(employeeId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("employee_bank_accounts")
    .select("id, employee_id, clabe, banco")
    .eq("employee_id", employeeId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as BankAccount | null;
}

async function syncBankAccount(
  row: RawImportRow,
  employeeId: string,
  activeBankAccount: BankAccount | null,
  normalized: NormalizedPayload,
) {
  const supabase = getSupabaseAdmin();
  const clabe = requireString(normalized.clabe, "CLABE requerida.");
  const banco = requireString(normalized.banco, "Banco requerido.");

  if (activeBankAccount?.clabe === clabe && activeBankAccount.banco === banco) {
    return false;
  }

  if (activeBankAccount) {
    const { error } = await supabase
      .from("employee_bank_accounts")
      .update({ is_active: false })
      .eq("id", activeBankAccount.id);

    if (error) {
      throw error;
    }
  }

  const { data, error } = await supabase
    .from("employee_bank_accounts")
    .insert({
      employee_id: employeeId,
      clabe,
      banco,
      is_active: true,
      source_batch_id: row.batch_id,
      source_row_id: row.id,
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  await createAuditEvent({
    event_name: activeBankAccount ? "bank_account.replaced" : "bank_account.created",
    entity_type: "employee_bank_accounts",
    entity_id: data.id,
    employee_id: employeeId,
    summary: activeBankAccount
      ? "Cuenta bancaria reemplazada por importacion."
      : "Cuenta bancaria creada por importacion.",
    metadata: {
      row_id: row.id,
      batch_id: row.batch_id,
      previous_last4: activeBankAccount?.clabe.slice(-4) ?? null,
      next_last4: clabe.slice(-4),
      banco,
    },
  });

  return true;
}

async function getCurrentOffer(employeeId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("advance_offers")
    .select(
      "id, employee_id, monto_prestamo_autorizado, estatus_p_esta_q, estatus_conversion, estatus_cliente, is_current, status, source_hash",
    )
    .eq("employee_id", employeeId)
    .eq("is_current", true)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as AdvanceOffer | null;
}

async function syncOffer(
  row: RawImportRow,
  employeeId: string,
  currentOffer: AdvanceOffer | null,
  normalized: NormalizedPayload,
) {
  const supabase = getSupabaseAdmin();
  const sourceHash = row.row_hash ?? hashJson(normalized);

  if (currentOffer?.source_hash === sourceHash) {
    return { changed: false, created: false, replaced: false };
  }

  const offerPayload = buildOfferPayload(row, employeeId, normalized, sourceHash);

  if (currentOffer) {
    const { error: replaceError } = await supabase
      .from("advance_offers")
      .update({
        is_current: false,
        status: "reemplazada",
      })
      .eq("id", currentOffer.id);

    if (replaceError) {
      throw replaceError;
    }
  }

  const { data: newOffer, error: createError } = await supabase
    .from("advance_offers")
    .insert(offerPayload)
    .select("id")
    .single();

  if (createError) {
    throw createError;
  }

  if (currentOffer) {
    const { error: linkError } = await supabase
      .from("advance_offers")
      .update({ replaced_by_offer_id: newOffer.id })
      .eq("id", currentOffer.id);

    if (linkError) {
      throw linkError;
    }
  }

  const revisionId = randomUUID();
  const { error: revisionError } = await supabase
    .from("advance_offer_revisions")
    .insert({
      id: revisionId,
      employee_id: employeeId,
      previous_offer_id: currentOffer?.id ?? null,
      new_offer_id: newOffer.id,
      batch_id: row.batch_id,
      row_id: row.id,
      previous_values: currentOffer ?? {},
      new_values: normalized as JsonRecord,
      change_hash: sourceHash,
    });

  if (revisionError) {
    throw revisionError;
  }

  await createAuditEvent({
    event_name: currentOffer ? "offer.replaced" : "offer.created",
    entity_type: "advance_offers",
    entity_id: newOffer.id,
    employee_id: employeeId,
    summary: currentOffer
      ? "Oferta vigente reemplazada por importacion."
      : "Oferta vigente creada por importacion.",
    metadata: {
      row_id: row.id,
      batch_id: row.batch_id,
      previous_offer_id: currentOffer?.id ?? null,
      new_offer_id: newOffer.id,
      revision_id: revisionId,
      source_hash: sourceHash,
    },
  });

  return {
    changed: true,
    created: !currentOffer,
    replaced: Boolean(currentOffer),
  };
}

function buildOfferPayload(
  row: RawImportRow,
  employeeId: string,
  normalized: NormalizedPayload,
  sourceHash: string,
) {
  const isEligible = Boolean(normalized.is_eligible);

  return {
    employee_id: employeeId,
    monto_prestamo_autorizado: normalized.monto_prestamo_autorizado ?? 0,
    estatus_p_esta_q: normalized.estatus_p_esta_q || null,
    estatus_conversion: isEligible ? "aceptada" : "rechazada",
    estatus_cliente: normalized.estatus_cliente || null,
    is_current: true,
    status: isEligible ? "vigente" : "rechazada",
    source_batch_id: row.batch_id,
    source_row_id: row.id,
    source_hash: sourceHash,
  };
}

async function updateRowStatus(rowId: string, status: "aplicada" | "sin_cambios") {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("raw_import_rows")
    .update({ status })
    .eq("id", rowId);

  if (error) {
    throw error;
  }
}

async function createAuditEvent(input: {
  event_name: string;
  entity_type: string;
  entity_id: string;
  employee_id?: string;
  summary: string;
  metadata?: JsonRecord;
}) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("audit_events").insert({
    event_name: input.event_name,
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    employee_id: input.employee_id ?? null,
    source: "backend",
    summary: input.summary,
    metadata: input.metadata ?? {},
    actor_type: "system",
  });

  if (error) {
    throw error;
  }
}

function hasEmployeeChanged(
  existing: Employee,
  next: EmployeePayload,
) {
  return (
    existing.curp !== (next.curp ?? null) ||
    existing.nombre !== next.nombre ||
    existing.apellidos !== (next.apellidos || null) ||
    existing.cp_csf !== (next.cp_csf ?? null) ||
    existing.telefono !== next.telefono ||
    existing.telefono_normalizado !== next.telefono_normalizado ||
    existing.email !== (next.email ?? null) ||
    existing.empleador !== (next.empleador || null)
  );
}

function requireString(value: unknown, message: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(message);
  }

  return value;
}

function hashJson(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}
