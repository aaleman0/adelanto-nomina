import Link from "next/link";
import {
  regenerateContractLinkAction,
  retryContractFlowAction,
} from "@/app/contracts/actions";
import { Card } from "@/components/ui/card";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { RoleGate } from "@/components/auth/role-gate";
import { SendWhatsAppButton } from "@/components/whatsapp/send-whatsapp-button";
import { CopyLinkButton } from "@/components/ui/copy-link-button";
import { Metric } from "@/components/ui/metric";
import { StatusBadge } from "@/components/ui/status-badge";
import type { StatusTone } from "@/components/ui/status-badge";
import type { ContractControlRow } from "@/lib/backoffice/contract-control";
import type { ContractTimelineRow } from "@/lib/backoffice/contract-detail";
import { MessageHistory } from "@/components/contracts/message-history";

const dateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "short" });

export function ContractDetailView({
  control,
  timeline,
  actionFeedback,
  eligibilityReason,
}: {
  control: ContractControlRow;
  timeline: ContractTimelineRow[];
  actionFeedback?: {
    tone: StatusTone;
    message: string;
  };
  eligibilityReason?: string | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      {actionFeedback ? (
        <div className={["rounded-xl border px-4 py-3 text-sm", getFeedbackClasses(actionFeedback.tone)].join(" ")}>
          {actionFeedback.message}
        </div>
      ) : null}

      {eligibilityReason ? (
        <div className="rounded-xl border border-[var(--warning)]/30 bg-warning-bg px-4 py-3 text-sm text-warning">
          <span className="font-semibold">No elegible:</span> {eligibilityReason}
        </div>
      ) : null}

      <Card className="p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-text-primary">
              {control.empleado || "Empleado sin nombre"}
            </h2>
            <p className="text-sm text-text-muted">
              {control.rfc || "-"} · {control.telefono_normalizado || "-"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={formatStatus(control.operational_status)} tone={getOperationalStatusTone(control.operational_status)} />
            <Link className="text-sm font-medium text-text-muted hover:text-text-primary" href="/contracts">
              Volver
            </Link>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Empleador" value={control.empleador || "-"} />
          <Metric label="Monto" value={formatMoney(control.monto_prestamo_autorizado)} />
          <Metric label="Último movimiento" value={formatDate(control.last_movement_at)} />
          <Metric label="WhatsApp ID" value={control.whatsapp_subscriber_id || "-"} />
        </div>
      </Card>

      <ProgressFlow control={control} />

      <ActionsCard control={control} />

      <section className="grid gap-4 lg:grid-cols-2">
        <StatusCard
          title="Mensaje WhatsApp"
          status={control.message_status || "pendiente_envio"}
          tone={getMessageStatusTone(control.message_status)}
          rows={[
            ["Enviado", formatDate(control.message_sent_at)],
            ["Click", formatDate(control.message_clicked_at)],
            ["Error", control.message_error || "-"],
          ]}
        />
        <StatusCard
          title="Contrato"
          status={control.contract_status || control.operational_status}
          tone={getOperationalStatusTone(control.operational_status)}
          rows={[
            ["Solicitud", formatDate(control.contract_requested_at)],
            ["ID", control.easylex_contract_id || "-"],
            ["Error", control.contract_error || control.attempt_error || "-"],
          ]}
        />
        <StatusCard
          title="Link de firma"
          status={control.contract_attempt_status || "sin_link"}
          tone={getAttemptStatusTone(control.contract_attempt_status)}
          rows={[
            ["Generado", formatDate(control.contract_generated_at)],
            ["Vence", formatDate(control.link_expires_at)],
            ["URL", control.signing_url || "-"],
          ]}
        />
        <StatusCard
          title="Firma"
          status={control.contract_signed_at || control.attempt_signed_at ? "firmado" : "pendiente"}
          tone={control.contract_signed_at || control.attempt_signed_at ? "success" : "warning"}
          rows={[
            ["Firmado", formatDate(control.contract_signed_at || control.attempt_signed_at)],
            ["Request ID", control.contract_request_id || "-"],
            ["Attempt ID", control.contract_attempt_id || "-"],
          ]}
        />
      </section>

      <MessageHistory employeeId={control.employee_id} />

      <TimelineCard timeline={timeline} />
    </div>
  );
}

function ProgressFlow({ control }: { control: ContractControlRow }) {
  const steps = [
    ["Importado", true],
    ["Mensaje", Boolean(control.message_sent_at || control.message_clicked_at)],
    ["Click", Boolean(control.message_clicked_at || control.contract_requested_at)],
    ["Contrato", Boolean(control.contract_generated_at || control.easylex_contract_id)],
    ["Firma", Boolean(control.contract_signed_at || control.attempt_signed_at)],
  ] as const;

  return (
    <Card className="p-5">
      <h3 className="text-sm font-medium text-text-muted">Progreso</h3>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {steps.map(([label, done]) => (
          <div
            key={label}
            className={[
              "flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm",
              done ? "border-primary bg-primary-light text-primary" : "border-border bg-surface-muted text-text-muted",
            ].join(" ")}
          >
            <span className={["h-2 w-2 rounded-full", done ? "bg-primary" : "bg-text-muted"].join(" ")} />
            {label}
          </div>
        ))}
      </div>
    </Card>
  );
}

function isLinkVigente(linkExpiresAt: string | null): boolean {
  if (!linkExpiresAt) return false;
  return new Date(linkExpiresAt) > new Date();
}

function ActionsCard({ control }: { control: ContractControlRow }) {
  const isSigned = control.operational_status === "firmado" || Boolean(control.contract_signed_at || control.attempt_signed_at);
  const hasRequest = Boolean(control.contract_request_id);
  const actionsDisabled = !hasRequest || isSigned;
  const linkVigente = isLinkVigente(control.link_expires_at);

  return (
    <Card className="p-5">
      <h3 className="text-sm font-medium text-text-muted">Acciones</h3>
      <div className="mt-3 flex flex-wrap items-start gap-2">
        {/* Enviar el mensaje inicial: es el paso que ARRANCA el flujo, así que
            se ofrece mientras el contrato no esté firmado, sin depender de que
            el empleado ya haya solicitado. */}
        {!isSigned && (
          <SendWhatsAppButton
            employeeId={control.employee_id}
            employeeName={control.empleado ?? control.nombre}
          />
        )}

        <form action={regenerateContractLinkAction}>
          <input name="contract_request_id" type="hidden" value={control.contract_request_id ?? ""} />
          <input name="employee_id" type="hidden" value={control.employee_id} />
          <RoleGate minimum="operaciones" mode="disable">
            <ConfirmSubmitButton
              confirmMessage="Se generará o reutilizará un link vigente para este contrato. ¿Continuar?"
              disabled={actionsDisabled}
            >
              Regenerar link
            </ConfirmSubmitButton>
          </RoleGate>
        </form>

        <form action={retryContractFlowAction}>
          <input name="contract_request_id" type="hidden" value={control.contract_request_id ?? ""} />
          <input name="employee_id" type="hidden" value={control.employee_id} />
          <RoleGate minimum="operaciones" mode="disable">
            <ConfirmSubmitButton
              confirmMessage="Se reintentará el flujo operativo y quedará evidencia en el timeline. ¿Continuar?"
              disabled={actionsDisabled}
              variant="secondary"
            >
              Reintentar flujo
            </ConfirmSubmitButton>
          </RoleGate>
        </form>

        {control.signing_url ? (
          <>
            {linkVigente ? (
              <Link
                className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-text-primary transition hover:bg-surface-muted"
                href={control.signing_url}
                target="_blank"
              >
                Abrir link
              </Link>
            ) : (
              <span
                className="inline-flex h-9 cursor-not-allowed items-center justify-center rounded-lg border border-border bg-surface-muted px-4 text-sm font-medium text-text-muted"
                title={`Link expirado${control.link_expires_at ? ` el ${formatDate(control.link_expires_at)}` : ""}`}
              >
                Link expirado
              </span>
            )}
            <CopyLinkButton value={control.signing_url} />
          </>
        ) : null}
      </div>
      <p className="mt-3 text-sm text-text-muted">
        {!hasRequest
          ? "Las acciones se habilitan cuando el empleado solicita desde WhatsApp."
          : isSigned
            ? "Este contrato ya está firmado; no se debe regenerar ni reintentar."
            : "Si el link sigue vigente, el sistema lo reutiliza. Si venció o hubo error, crea un nuevo intento."}
      </p>
    </Card>
  );
}

function StatusCard({
  title,
  status,
  tone,
  rows,
}: {
  title: string;
  status: string;
  tone: StatusTone;
  rows: Array<[string, string]>;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium text-text-primary">{title}</h3>
        <StatusBadge status={formatStatus(status)} tone={tone} />
      </div>
      <dl className="mt-3 space-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-1 sm:grid-cols-[120px_1fr]">
            <dt className="text-text-muted">{label}</dt>
            <dd className="break-all text-text-primary">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function TimelineCard({ timeline }: { timeline: ContractTimelineRow[] }) {
  return (
    <Card className="p-4">
      <h3 className="text-sm font-medium text-text-muted">Timeline</h3>
      <div className="mt-3 divide-y divide-border">
        {timeline.length > 0 ? (
          timeline.map((item, index) => (
            <article className="grid gap-2 py-3 md:grid-cols-[160px_140px_1fr]" key={`${item.entity_type}-${item.entity_id}-${item.event_type}-${index}`}>
              <div>
                <p className="text-sm font-medium text-text-primary">{formatDate(item.occurred_at)}</p>
                <p className="text-xs text-text-muted">{item.source}</p>
              </div>
              <StatusBadge status={formatStatus(item.status || item.event_type)} tone={getTimelineTone(item.status, item.event_type)} />
              <div>
                <p className="text-sm text-text-primary">{item.summary}</p>
                <p className="mt-0.5 text-xs text-text-muted">{item.entity_type || "-"}</p>
              </div>
            </article>
          ))
        ) : (
          <p className="py-4 text-sm text-text-muted">Sin eventos para este empleado.</p>
        )}
      </div>
    </Card>
  );
}

function formatMoney(value: number | null) {
  if (value === null) return "-";
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return dateFormatter.format(new Date(value));
}

function formatStatus(value: string | null) {
  if (!value) return "pendiente";
  return value.replaceAll("_", " ");
}

function getMessageStatusTone(status: string | null): StatusTone {
  if (status === "error") return "danger";
  if (status === "click" || status === "enviado" || status === "entregado") return "success";
  if (status === "pendiente_envio") return "warning";
  return "neutral";
}

function getOperationalStatusTone(status: string): StatusTone {
  if (status === "error") return "danger";
  if (status === "firmado" || status === "contrato_generado") return "success";
  if (status === "link_expirado" || status === "pendiente_envio") return "warning";
  return "neutral";
}

function getAttemptStatusTone(status: string | null): StatusTone {
  if (status === "error") return "danger";
  if (status === "firmado" || status === "generado") return "success";
  if (status === "expirado" || status === null) return "warning";
  return "neutral";
}

function getTimelineTone(status: string | null, eventType: string): StatusTone {
  if (status === "error" || eventType.includes("error")) return "danger";
  if (status === "firmado" || eventType.includes("signed")) return "success";
  if (status === "expirado" || eventType.includes("expired")) return "warning";
  return "neutral";
}

function getFeedbackClasses(tone: StatusTone) {
  if (tone === "success") return "border-green-200 bg-green-50 text-green-900";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-900";
  if (tone === "danger") return "border-red-200 bg-red-50 text-red-900";
  return "border-border bg-surface-muted text-text-primary";
}
