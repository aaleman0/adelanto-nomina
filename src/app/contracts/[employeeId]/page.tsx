import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ContractDetailView } from "@/components/contracts/contract-detail-view";
import { getContractDetailData } from "@/lib/backoffice/contract-detail";
import { validateEligibility } from "@/lib/whatsapp/eligibility";

export const dynamic = "force-dynamic";

type ContractDetailPageProps = {
  params: Promise<{
    employeeId: string;
  }>;
  searchParams?: Promise<{
    action_status?: string;
  }>;
};

export default async function ContractDetailPage({
  params,
  searchParams,
}: ContractDetailPageProps) {
  const { employeeId } = await params;
  const resolvedSearchParams = await searchParams;
  const { control, timeline } = await getContractDetailData(employeeId);

  if (!control) {
    notFound();
  }

  // Si el empleado quedó fuera del embudo, resolver el MOTIVO concreto (sin
  // oferta, oferta rechazada, sin cuenta bancaria...) para mostrarlo. El dato
  // ya existía en validateEligibility; solo no se enseñaba.
  let eligibilityReason: string | null = null;
  if (control.operational_status === "no_elegible") {
    try {
      const elig = await validateEligibility(employeeId);
      eligibilityReason = elig.eligible ? null : elig.reason ?? "No elegible.";
    } catch {
      eligibilityReason = "No se pudo determinar el motivo de inelegibilidad.";
    }
  }

  return (
    <AppShell>
      <ContractDetailView
        actionFeedback={getActionFeedback(resolvedSearchParams?.action_status)}
        control={control}
        timeline={timeline}
        eligibilityReason={eligibilityReason}
      />
    </AppShell>
  );
}

function getActionFeedback(status: string | undefined) {
  if (status === "link_regenerated") {
    return {
      tone: "success" as const,
      message: "Link regenerado correctamente. El nuevo intento ya aparece en el timeline.",
    };
  }

  if (status === "link_reused") {
    return {
      tone: "warning" as const,
      message: "El link seguia vigente, por eso se reutilizo el intento existente.",
    };
  }

  if (status === "already_signed") {
    return {
      tone: "warning" as const,
      message: "El contrato ya esta firmado; no se ejecuto ninguna accion.",
    };
  }

  if (status === "contract_resent") {
    return {
      tone: "success" as const,
      message: "El contrato firmado se reenvió al empleado por WhatsApp.",
    };
  }

  if (status === "contract_resend_failed") {
    return {
      tone: "warning" as const,
      message:
        "El contrato quedó archivado, pero el reenvío por WhatsApp no se completó (revisa que el empleado esté dentro de la ventana de 24 h y que el token de WhatsApp esté vigente).",
    };
  }

  if (status === "not_found") {
    return {
      tone: "danger" as const,
      message: "No se encontro la solicitud de contrato para operar.",
    };
  }

  if (status === "forbidden") {
    return {
      tone: "danger" as const,
      message: "No tienes el rol necesario para esta acción (requiere operaciones).",
    };
  }

  if (status === "contract_ready") {
    return {
      tone: "success" as const,
      message:
        "Contrato generado. El link de firma se envió al empleado por WhatsApp; si el envío falla, puedes copiarlo o abrirlo desde las acciones.",
    };
  }

  if (status === "contract_link_failed") {
    return {
      tone: "warning" as const,
      message:
        "El contrato se generó, pero el link de firma no se pudo crear (proveedor no disponible). Quedó en cola para reintentar.",
    };
  }

  if (status === "no_offer") {
    return {
      tone: "warning" as const,
      message: "El empleado no tiene una oferta vigente para generar contrato.",
    };
  }

  if (status === "not_eligible") {
    return {
      tone: "warning" as const,
      message: "La oferta del empleado no está disponible para solicitar adelanto.",
    };
  }

  if (status === "contract_error") {
    return {
      tone: "danger" as const,
      message: "No se pudo generar el contrato. Revisa el timeline o inténtalo de nuevo.",
    };
  }

  return undefined;
}
