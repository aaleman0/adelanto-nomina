import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { EasyLexClient, type EasyLexValidationConfig } from "@/lib/easylex/client";
import { generateContractPdf } from "@/lib/easylex/contract-pdf";
import { easylexEnv } from "@/lib/env";
import { getCompanySettings } from "@/lib/company-settings";
import { logger } from "@/lib/logger";
import { LINK_TTL_HOURS } from "./link-ttl";

export type Employee = {
  id: string;
  rfc: string;
  curp: string | null;
  nombre: string;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  apellidos: string | null;
  cp_csf: string | null;
  telefono: string;
  telefono_normalizado: string;
  email: string | null;
  empleador: string | null;
  estado_civil: string | null;
  nacionalidad: string | null;
  lugar_origen: string | null;
  fecha_nacimiento: string | null;
  domicilio: string | null;
};

export type AdvanceOffer = {
  id: string;
  employee_id: string;
  monto_prestamo_autorizado: number;
  estatus_p_esta_q: string | null;
  estatus_conversion: string;
  estatus_cliente: string | null;
  is_eligible: boolean;
  status: string;
  source_batch_id: string | null;
  source_row_id: string | null;
};

export type BankAccount = {
  clabe: string;
  banco: string;
};

export type ContractRequest = {
  id: string;
  employee_id: string;
  offer_id: string;
  status: "recibida" | "generando" | "link_generado" | "firmado" | "error";
  signed_at: string | null;
};

export type ContractAttempt = {
  id: string;
  contract_request_id: string;
  attempt_number: number;
  easylex_contract_id: string | null;
  signing_url: string | null;
  status: "generando" | "generado" | "expirado" | "firmado" | "error";
  expires_at: string | null;
  generated_at: string | null;
  signed_at: string | null;
  error_message: string | null;
};

export async function createEasyLexAttempt(
  contractRequest: ContractRequest,
  employee: Employee,
  offer: AdvanceOffer,
  bankAccount: BankAccount | null,
  latestAttempt: ContractAttempt | null,
  correlationId: string,
): Promise<ContractAttempt> {
  const supabase = getSupabaseAdmin();
  const now = new Date();
  const attemptNumber = (latestAttempt?.attempt_number ?? 0) + 1;
  const attemptId = randomUUID();

  if (
    latestAttempt &&
    latestAttempt.status === "generado" &&
    latestAttempt.expires_at &&
    new Date(latestAttempt.expires_at).getTime() <= Date.now()
  ) {
    await supabase
      .from("contract_attempts")
      .update({ status: "expirado" })
      .eq("id", latestAttempt.id);
  }

  const apellidoPaterno = employee.apellido_paterno ?? "";
  const apellidoMaterno = employee.apellido_materno ?? apellidoPaterno;
  const nombreCompleto = `${employee.nombre ?? ""} ${apellidoPaterno} ${apellidoMaterno}`.trim();

  const companySettings = await getCompanySettings();

  const pdfBuffer = await generateContractPdf({
    nombreCompleto,
    apellidoPaterno,
    apellidoMaterno,
    rfc: employee.rfc,
    curp: employee.curp,
    email: employee.email,
    empleador: employee.empleador ?? "Empleador",
    monto: offer.monto_prestamo_autorizado,
    clabe: bankAccount?.clabe ?? null,
    banco: bankAccount?.banco ?? null,
    estadoCivil: employee.estado_civil,
    nacionalidad: employee.nacionalidad,
    lugarOrigen: employee.lugar_origen,
    fechaNacimiento: employee.fecha_nacimiento,
    domicilio: employee.domicilio,
    fechaFirma: now,
    companySettings,
  });

  const callbackUrl = easylexEnv.callbackUrl || undefined;
  const fileName = `contrato_${employee.rfc}_${attemptId.slice(0, 8)}`;
  const validation = buildValidationConfig(companySettings);

  // El TTL de la app coincide con la expiración real del documento en EasyLex.
  const expiresAt = new Date(now.getTime() + LINK_TTL_HOURS * 60 * 60 * 1000);

  const client = new EasyLexClient();
  const easylexResult = await client.createDocument({
    fileName,
    signatories: [
      {
        firstName: employee.nombre ?? "Empleado",
        lastName: apellidoPaterno,
        motherLastName: apellidoMaterno,
        email: employee.email ?? `${employee.rfc.toLowerCase()}@placeholder.local`,
      },
    ],
    pdfBuffer,
    callbackUrl,
    expirationDate: expiresAt.toISOString(),
    validation,
  });

  if (!easylexResult.ok) {
    logger.error("easylex.attempt.create_failed", new Error(easylexResult.error), {
      contractRequestId: contractRequest.id,
      attemptNumber,
      correlationId,
    });

    const { error: insertError } = await supabase
      .from("contract_attempts")
      .insert({
        id: attemptId,
        contract_request_id: contractRequest.id,
        attempt_number: attemptNumber,
        status: "error",
        error_message: easylexResult.error,
        generated_at: now.toISOString(),
        raw_response: { provider: "easylex", error: easylexResult.error, rawResponse: easylexResult.rawResponse ?? null },
      });

    if (insertError) throw insertError;

    throw new Error(`Error al crear contrato en EasyLex: ${easylexResult.error}`);
  }

  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL;
  const publicSigningUrl = appBaseUrl
    ? `${appBaseUrl.replace(/\/+$/, "")}/firmar/${easylexResult.signerId}`
    : easylexResult.signingUrl;

  const { data, error } = await supabase
    .from("contract_attempts")
    .insert({
      id: attemptId,
      contract_request_id: contractRequest.id,
      attempt_number: attemptNumber,
      easylex_contract_id: easylexResult.documentId,
      signing_url: publicSigningUrl,
      status: "generado",
      expires_at: expiresAt.toISOString(),
      generated_at: now.toISOString(),
      raw_response: {
        provider: "easylex",
        document_id: easylexResult.documentId,
        signer_id: easylexResult.signerId,
        signing_url: publicSigningUrl,
        easylex_signing_url: easylexResult.signingUrl,
        expires_at: expiresAt.toISOString(),
        raw: easylexResult.rawResponse,
      },
    })
    .select("id, contract_request_id, attempt_number, easylex_contract_id, signing_url, status, expires_at, generated_at, signed_at, error_message")
    .single();

  if (error) throw error;

  logger.info("easylex.attempt.created", {
    attemptId,
    documentId: easylexResult.documentId,
    signerId: easylexResult.signerId,
    signingUrl: publicSigningUrl,
    easylexSigningUrl: easylexResult.signingUrl,
    correlationId,
    validation,
  });

  return data as ContractAttempt;
}

function readBooleanSetting(settings: Record<string, string>, key: string): boolean {
  return settings[key]?.toLowerCase() === "true";
}

function buildValidationConfig(settings: Record<string, string>): EasyLexValidationConfig {
  const config: EasyLexValidationConfig = {
    validateId: readBooleanSetting(settings, "easylex_validate_id"),
    validateSms: readBooleanSetting(settings, "easylex_validate_sms"),
    validatePicture: readBooleanSetting(settings, "easylex_validate_picture"),
    validateEmail: readBooleanSetting(settings, "easylex_validate_email"),
    validateBiometric: readBooleanSetting(settings, "easylex_validate_biometric"),
    validateLiveness: readBooleanSetting(settings, "easylex_validate_liveness"),
    validateVoice: readBooleanSetting(settings, "easylex_validate_voice"),
  };

  // EasyLex exige que el biométrico y la prueba de vida vengan acompañados de
  // validación de INE (validateId) y foto comparativa (validatePicture): tiene
  // sentido —para cotejar la cara necesita el documento—. Sin esa dependencia,
  // createDocument falla con 502 "InvalidRequest". Se fuerza aquí para que una
  // configuración inconsistente en company_settings no tumbe el pipeline.
  if (config.validateBiometric || config.validateLiveness) {
    config.validateId = true;
    config.validatePicture = true;
  }

  return config;
}
