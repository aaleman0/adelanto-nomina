import Link from "next/link";
import {
  regenerateContractLinkAction,
  retryContractFlowAction,
} from "@/app/contracts/actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { CopyLinkButton } from "@/components/ui/copy-link-button";
import { Metric } from "@/components/ui/metric";
import { StatusBadge } from "@/components/ui/status-badge";
import type { StatusTone } from "@/components/ui/status-badge";
import type { ContractControlRow } from "@/lib/backoffice/contract-control";
import type { ContractTimelineRow } from "@/lib/backoffice/contract-detail";

const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function ContractDetailView({
  control,
  timeline,
  actionFeedback,
}: {
  control: ContractControlRow;
  timeline: ContractTimelineRow[];
  actionFeedback?: {
    tone: StatusTone;
    message: string;
  };
}) {
  return (
    <div className="flex flex-col gap-6">
      {actionFeedback ? (
        <div
          className={[
            "rounded-base border px-4 py-3 text-sm font-semibold",
            getFeedbackClasses(actionFeedback.tone),
          ].join(" ")}
        >
          {actionFeedback.message}
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-primary">
              Detalle operativo
            </p>
            <h2 className="mt-1 text-h2 font-semibold text-text-primary">
              {control.empleado || "Empleado sin nombre"}
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              RFC {control.rfc || "-"} · Telefono{" "}
              {control.telefono_normalizado || "-"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge
              status={formatStatus(control.operational_status)}
              tone={getOperationalStatusTone(control.operational_status)}
            />
            <Link
              className="inline-flex h-8 items-center rounded-base border border-border px-3 text-sm font-semibold text-text-primary hover:bg-surface-muted"
              href="/contracts"
            >
              Volver a contratos
            </Link>
          </div>
        </CardHeader>

        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Empleador" value={control.empleador || "-"} />
            <Metric
              label="Monto"
              value={formatMoney(control.monto_prestamo_autorizado)}
              tone="success"
            />
            <Metric
              label="Ultimo movimiento"
              value={formatDate(control.last_movement_at)}
            />
            <Metric
              label="Subscriber"
              value={control.manychat_subscriber_id || "-"}
            />
          </div>
        </CardBody>
      </Card>

      <ProgressFlow control={control} />

      <ActionsCard control={control} />

      <section className="grid gap-6 lg:grid-cols-2">
        <StatusCard
          title="Mensaje ManyChat"
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
            ["Contract ID", control.easylex_contract_id || "-"],
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
          status={
            control.contract_signed_at || control.attempt_signed_at
              ? "firmado"
              : "pendiente"
          }
          tone={
            control.contract_signed_at || control.attempt_signed_at
              ? "success"
              : "warning"
          }
          rows={[
            [
              "Firmado",
              formatDate(control.contract_signed_at || control.attempt_signed_at),
            ],
            ["Request ID", control.contract_request_id || "-"],
            ["Attempt ID", control.contract_attempt_id || "-"],
          ]}
        />
      </section>

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
    <Card>
      <CardHeader>
        <h3 className="text-h2 font-semibold text-text-primary">Progreso operativo</h3>
        <p className="text-sm text-text-muted">Importado → Mensaje → Click → Contrato → Firma</p>
      </CardHeader>
      <CardBody>
        <div className="grid gap-3 md:grid-cols-5">
          {steps.map(([label, done], index) => (
            <div className={["rounded-base border px-4 py-3 transition", done ? "border-primary bg-primary/5" : "border-border bg-surface-muted"].join(" ")} key={label}>
              <p className="text-xs font-semibold uppercase text-text-muted">Paso {index + 1}</p>
              <p className="mt-1 font-semibold text-text-primary">{label}</p>
              <p className={done ? "mt-1 text-sm text-primary" : "mt-1 text-sm text-text-muted"}>{done ? "Completado" : "Pendiente"}</p>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

function isLinkVigente(linkExpiresAt: string | null): boolean {
  if (!linkExpiresAt) return false;
  return new Date(linkExpiresAt) > new Date();
}

function ActionsCard({ control }: { control: ContractControlRow }) {
  const isSigned =
    control.operational_status === "firmado" ||
    Boolean(control.contract_signed_at || control.attempt_signed_at);
  const hasRequest = Boolean(control.contract_request_id);
  const actionsDisabled = !hasRequest || isSigned;
  const linkVigente = isLinkVigente(control.link_expires_at);

  return (
    <Card>
      <CardHeader>
        <h3 className="text-h2 font-semibold text-text-primary">
          Acciones operativas
        </h3>
        <p className="text-sm text-text-muted">
          Acciones internas para operar links mock antes de conectar EasyLex real.
        </p>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-3">
          <form action={regenerateContractLinkAction}>
            <input
              name="contract_request_id"
              type="hidden"
              value={control.contract_request_id ?? ""}
            />
            <input name="employee_id" type="hidden" value={control.employee_id} />
            <ConfirmSubmitButton
              confirmMessage="Se generará o reutilizará un link vigente para este contrato. ¿Continuar?"
              disabled={actionsDisabled}
            >
              Regenerar link
            </ConfirmSubmitButton>
          </form>

          <form action={retryContractFlowAction}>
            <input
              name="contract_request_id"
              type="hidden"
              value={control.contract_request_id ?? ""}
            />
            <input name="employee_id" type="hidden" value={control.employee_id} />
            <ConfirmSubmitButton
              confirmMessage="Se reintentará el flujo operativo y quedará evidencia en el timeline. ¿Continuar?"
              disabled={actionsDisabled}
              variant="secondary"
            >
              Reintentar flujo
            </ConfirmSubmitButton>
          </form>

          {control.signing_url ? (
            <>
              {linkVigente ? (
                <Link
                  className="inline-flex h-10 items-center justify-center rounded-base border border-border bg-surface px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted"
                  href={control.signing_url}
                  target="_blank"
                >
                  Abrir link
                </Link>
              ) : (
                <span
                  className="inline-flex h-10 cursor-not-allowed items-center justify-center rounded-base border border-border bg-surface-muted px-4 text-sm font-semibold text-text-muted"
                  title={`Link expirado${control.link_expires_at ? ` el ${new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(control.link_expires_at))}` : ""}`}
                >
                  Link expirado
                </span>
              )}
              <CopyLinkButton value={control.signing_url} />
            </>
          ) : null}
        </div>

        <div className="rounded-base border border-border bg-surface-muted px-4 py-3 text-sm text-text-muted">
          {!hasRequest
            ? "Las acciones se habilitan cuando el empleado solicita desde ManyChat."
            : isSigned
              ? "Este contrato ya esta firmado; no se debe regenerar ni reintentar."
              : "Si el link sigue vigente, el sistema lo reutiliza. Si vencio o hubo error, crea un nuevo intento y deja evidencia en timeline."}
        </div>
      </CardBody>
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
    <Card>
      <CardHeader className="flex items-center justify-between gap-3">
        <h3 className="text-h2 font-semibold text-text-primary">{title}</h3>
        <StatusBadge status={formatStatus(status)} tone={tone} />
      </CardHeader>
      <CardBody className="flex flex-col gap-3 text-sm">
        {rows.map(([label, value]) => (
          <div className="grid gap-1 sm:grid-cols-[140px_1fr]" key={label}>
            <span className="font-semibold text-text-muted">{label}</span>
            <span className="break-all text-text-primary">{value}</span>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

function TimelineCard({ timeline }: { timeline: ContractTimelineRow[] }) {
  return (
    <Card>
      <CardHeader>
        <h3 className="text-h2 font-semibold text-text-primary">
          Timeline operativo
        </h3>
        <p className="text-sm text-text-muted">
          Evidencia ordenada por fecha para explicar que paso con este contrato.
        </p>
      </CardHeader>
      <CardBody className="p-0">
        {timeline.length > 0 ? (
          <div className="divide-y divide-border">
            {timeline.map((item, index) => (
              <article
                className="grid gap-3 px-6 py-4 md:grid-cols-[180px_180px_1fr]"
                key={`${item.entity_type}-${item.entity_id}-${item.event_type}-${index}`}
              >
                <div>
                  <p className="text-sm font-semibold text-text-primary">
                    {formatDate(item.occurred_at)}
                  </p>
                  <p className="text-xs uppercase text-text-muted">
                    {item.source}
                  </p>
                </div>
                <div className="flex flex-col items-start gap-2">
                  <StatusBadge
                    status={formatStatus(item.status || item.event_type)}
                    tone={getTimelineTone(item.status, item.event_type)}
                  />
                  <span className="text-xs text-text-muted">
                    {formatStatus(item.event_type)}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-text-primary">{item.summary}</p>
                  <p className="mt-1 text-xs text-text-muted">
                    {item.entity_type || "-"} · {shortId(item.entity_id)}
                  </p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="px-6 py-8 text-sm text-text-muted">
            Todavia no hay eventos de timeline para este empleado.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function formatMoney(value: number | null) {
  if (value === null) {
    return "-";
  }

  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return dateFormatter.format(new Date(value));
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ");
}

function shortId(value: string | null) {
  if (!value) {
    return "-";
  }

  return value.length > 12 ? `${value.slice(0, 8)}...` : value;
}

function getMessageStatusTone(status: string | null): StatusTone {
  if (status === "error") {
    return "danger";
  }

  if (status === "click" || status === "enviado" || status === "entregado") {
    return "success";
  }

  if (status === "pendiente_envio") {
    return "warning";
  }

  return "neutral";
}

function getOperationalStatusTone(status: string): StatusTone {
  if (status === "error") {
    return "danger";
  }

  if (status === "firmado" || status === "contrato_generado") {
    return "success";
  }

  if (status === "link_expirado" || status === "pendiente_envio") {
    return "warning";
  }

  return "neutral";
}

function getAttemptStatusTone(status: string | null): StatusTone {
  if (status === "error") {
    return "danger";
  }

  if (status === "firmado" || status === "generado") {
    return "success";
  }

  if (status === "expirado" || status === null) {
    return "warning";
  }

  return "neutral";
}

function getTimelineTone(status: string | null, eventType: string): StatusTone {
  if (status === "error" || eventType.includes("error")) {
    return "danger";
  }

  if (status === "firmado" || eventType.includes("signed")) {
    return "success";
  }

  if (status === "expirado" || eventType.includes("expired")) {
    return "warning";
  }

  return "neutral";
}

function getFeedbackClasses(tone: StatusTone) {
  if (tone === "success") {
    return "border-green-200 bg-green-50 text-green-900";
  }

  if (tone === "warning") {
    return "border-yellow-200 bg-yellow-50 text-yellow-900";
  }

  if (tone === "danger") {
    return "border-red-200 bg-red-50 text-red-900";
  }

  return "border-border bg-surface-muted text-text-primary";
}
