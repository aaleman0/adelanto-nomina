import { getSupabaseAdmin } from "@/lib/supabase/server";

export type EligibilityResult = {
  eligible: boolean;
  reason?: string;
};

export type EmployeeEligibility = {
  employee_id: string;
  nombre: string | null;
  apellidos: string | null;
  rfc: string | null;
  telefono_normalizado: string | null;
  empleador: string | null;
  monto_prestamo_autorizado: number | null;
  eligible: boolean;
  reason?: string;
};

export async function validateEligibility(employeeId: string): Promise<EligibilityResult> {
  const supabase = getSupabaseAdmin();

  // Obtener oferta vigente
  const { data: offer, error: offerError } = await supabase
    .from("advance_offers")
    .select("id, is_eligible, status, employee_id")
    .eq("employee_id", employeeId)
    .eq("is_current", true)
    .maybeSingle();

  if (offerError) throw offerError;

  if (!offer) {
    return { eligible: false, reason: "Sin oferta vigente" };
  }

  if (!offer.is_eligible) {
    return { eligible: false, reason: "Oferta no elegible" };
  }

  if (offer.status === "rechazada") {
    return { eligible: false, reason: "Oferta rechazada" };
  }

  if (offer.status === "solicitada" || offer.status === "firmada") {
    return { eligible: false, reason: `Oferta ya en estado: ${offer.status}` };
  }

  // Verificar cuenta bancaria activa
  const { data: bank, error: bankError } = await supabase
    .from("employee_bank_accounts")
    .select("id")
    .eq("employee_id", employeeId)
    .eq("is_active", true)
    .maybeSingle();

  if (bankError) throw bankError;

  if (!bank) {
    return { eligible: false, reason: "Sin cuenta bancaria activa" };
  }

  return { eligible: true };
}

export async function getEmployeesEligibility(employeeIds: string[]): Promise<EmployeeEligibility[]> {
  if (employeeIds.length === 0) return [];

  const supabase = getSupabaseAdmin();

  // Obtener datos base de los employees
  const { data: employees, error: empError } = await supabase
    .from("employees")
    .select("id, nombre, apellidos, rfc, telefono_normalizado, empleador")
    .in("id", employeeIds);

  if (empError) throw empError;

  // Obtener ofertas vigentes de todos ellos
  const { data: offers, error: offerError } = await supabase
    .from("advance_offers")
    .select("employee_id, id, is_eligible, status, monto_prestamo_autorizado")
    .in("employee_id", employeeIds)
    .eq("is_current", true);

  if (offerError) throw offerError;

  // Obtener cuentas bancarias activas
  const { data: banks, error: bankError } = await supabase
    .from("employee_bank_accounts")
    .select("employee_id")
    .in("employee_id", employeeIds)
    .eq("is_active", true);

  if (bankError) throw bankError;

  const offerMap = new Map((offers ?? []).map((o) => [o.employee_id, o]));
  const bankSet = new Set((banks ?? []).map((b) => b.employee_id));

  return (employees ?? []).map((emp) => {
    const offer = offerMap.get(emp.id);
    let eligible = true;
    let reason: string | undefined;

    if (!offer) {
      eligible = false;
      reason = "Sin oferta vigente";
    } else if (!offer.is_eligible) {
      eligible = false;
      reason = "Oferta no elegible";
    } else if (offer.status === "rechazada") {
      eligible = false;
      reason = "Oferta rechazada";
    } else if (offer.status === "solicitada" || offer.status === "firmada") {
      eligible = false;
      reason = `Oferta ya en estado: ${offer.status}`;
    } else if (!bankSet.has(emp.id)) {
      eligible = false;
      reason = "Sin cuenta bancaria activa";
    }

    return {
      employee_id: emp.id,
      nombre: emp.nombre,
      apellidos: emp.apellidos,
      rfc: emp.rfc,
      telefono_normalizado: emp.telefono_normalizado,
      empleador: emp.empleador,
      monto_prestamo_autorizado: offer?.monto_prestamo_autorizado ?? null,
      eligible,
      reason,
    };
  });
}
