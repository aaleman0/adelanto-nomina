"use client";

import { useState, useCallback } from "react";
import { useNotifications } from "@/components/ui/notifications";
import { useToast } from "@/components/ui/toast";
import { RecipientStep } from "./recipient-step";
import { MessageTemplateStep } from "./message-template-step";
import { EligibilitySummary } from "./eligibility-summary";
import { SendConfirmation } from "./send-confirmation";
import { SendResult } from "./send-result";
import type {
  FlowStep,
  SendMode,
  ValidationSummary,
  SendResult as SendResultType,
  RecentImport,
} from "./types";
import { ScrollProgressPanel } from "@/components/ui/scroll-progress-panel";

const STEP_LABELS: Record<FlowStep, string> = {
  1: "Destinatarios",
  2: "Mensaje",
  3: "Revisión",
  4: "Confirmación",
  5: "Resultado",
};

export const DEFAULT_TEMPLATE = "adelanto_nomina_v2";

function StepIndicator({ current }: { current: FlowStep }) {
  const steps: FlowStep[] = [1, 2, 3, 4];
  return (
    <nav className="flex items-center gap-1">
      {steps.map((step, idx) => {
        const isActive = step === current;
        return (
          <div key={step} className="flex items-center">
            {idx > 0 && <span className={["mx-1 h-px w-6 sm:w-10", step < current ? "bg-primary" : "bg-border"].join(" ")} />}
            <span className={["flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium", isActive ? "bg-primary text-white" : step < current ? "bg-emerald-500 text-white" : "bg-surface-muted text-text-muted"].join(" ")}>
              {step}
            </span>
          </div>
        );
      })}
    </nav>
  );
}

export function GuidedSendFlow() {
  const { addNotification } = useNotifications();
  const toastify = useToast();

  const [step, setStep] = useState<FlowStep>(1);
  const [mode, setMode] = useState<SendMode>("import");
  const [selectedImportId, setSelectedImportId] = useState("");
  const [importMeta, setImportMeta] = useState<RecentImport | null>(null);
  const [manualIds, setManualIds] = useState<string[]>([]);
  const [templateName, setTemplateName] = useState(DEFAULT_TEMPLATE);
  const [buttonUrl, setButtonUrl] = useState("");
  const [validation, setValidation] = useState<ValidationSummary | null>(null);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [result, setResult] = useState<SendResultType | null>(null);

  function resetFlow() {
    setStep(1);
    setMode("import");
    setSelectedImportId("");
    setImportMeta(null);
    setManualIds([]);
    setTemplateName(DEFAULT_TEMPLATE);
    setButtonUrl("");
    setValidation(null);
    setSelectedEmployeeIds(new Set());
    setSending(false);
    setSendError(null);
    setResult(null);
  }

  const handleSend = useCallback(async () => {
    if (selectedEmployeeIds.size === 0) return;
    setSending(true);
    setSendError(null);

    try {
      const basePayload = { employeeIds: [...selectedEmployeeIds], templateName };
      const payload =
        mode === "import"
          ? { mode: "import", importId: selectedImportId, ...basePayload }
          : { mode: "manual", ...basePayload };
      if (buttonUrl.trim()) {
        (payload as Record<string, unknown>).buttonUrl = buttonUrl.trim();
      }

      const res = await fetch("/api/whatsapp/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (!json.ok) throw new Error(json.error ?? "Error al enviar.");

      // Camino con cola (Cloud Tasks): responde status='queued' sin sent/failed.
      // Se normaliza a un SendResult 'queued' para no mostrar "0 enviados".
      if (json.status === "queued") {
        const queued = (json.queued as number) ?? 0;
        setResult({ total: queued, eligible: queued, sent: 0, failed: 0, queued, status: "queued", errors: [] });
        setStep(5);
        toastify.success(`Encolados ${queued} envíos. Se procesan en segundo plano.`);
        addNotification({
          type: "success",
          title: "Envío masivo encolado",
          message: `${queued} mensaje${queued !== 1 ? "s" : ""} encolado${queued !== 1 ? "s" : ""}; revisa el historial para el resultado.`,
          actionUrl: "/whatsapp/history",
          actionLabel: "Ver historial",
        });
        return;
      }

      const r = json as SendResultType;
      setResult(r);
      setStep(5);

      toastify.success(`Envío completado: ${r.sent} enviado${r.sent !== 1 ? "s" : ""}${r.failed > 0 ? `, ${r.failed} errores` : ""}.`);
      addNotification({
        type: r.failed > 0 ? "warning" : "success",
        title: "Envío masivo completado",
        message: `${r.sent} mensaje${r.sent !== 1 ? "s" : ""} enviado${r.sent !== 1 ? "s" : ""}${r.failed > 0 ? `, ${r.failed} fallido${r.failed !== 1 ? "s" : ""}` : ""}.`,
        actionUrl: "/whatsapp/history",
        actionLabel: "Ver historial",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error inesperado.";
      setSendError(msg);
      toastify.error(`Error al enviar: ${msg}`);
    } finally {
      setSending(false);
    }
  }, [mode, selectedImportId, selectedEmployeeIds, templateName, buttonUrl, toastify, addNotification]);

  if (step === 5 && result) {
    return <SendResult result={result} templateName={templateName} onNewSend={resetFlow} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="surface-panel flex shrink-0 items-center justify-between rounded-xl px-4 py-3">
        <StepIndicator current={step} />
        <p className="text-xs text-text-muted">
          Paso {step} de 4: <span className="font-medium text-text-primary">{STEP_LABELS[step]}</span>
        </p>
      </div>

      <ScrollProgressPanel className="max-h-[calc(100dvh-13rem)] min-h-[420px]">
      <div className="p-5 sm:p-6">
      {step === 1 && (
        <section>
          <SectionHeader step={1} title="Destinatarios" />
          <RecipientStep
            mode={mode}
            selectedImportId={selectedImportId}
            manualIds={manualIds}
            onModeChange={(m) => {
              setMode(m);
              setValidation(null);
              setSelectedEmployeeIds(new Set());
            }}
            onImportChange={(id, meta) => {
              setSelectedImportId(id);
              setImportMeta(meta);
              setValidation(null);
              setSelectedEmployeeIds(new Set());
            }}
            onManualIdsChange={setManualIds}
            onNext={() => setStep(2)}
          />
        </section>
      )}

      {step === 2 && (
        <section>
          <SectionHeader step={2} title="Mensaje" />
          <MessageTemplateStep
            templateName={templateName}
            buttonUrl={buttonUrl}
            onTemplateChange={setTemplateName}
            onButtonUrlChange={setButtonUrl}
            onNext={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        </section>
      )}

      {step === 3 && (
        <section>
          <SectionHeader step={3} title="Revisión" />
          <EligibilitySummary
            mode={mode}
            importId={selectedImportId}
            employeeIds={manualIds}
            templateName={templateName}
            validation={validation}
            selectedEmployeeIds={selectedEmployeeIds}
            onValidationChange={setValidation}
            onSelectionChange={setSelectedEmployeeIds}
            onNext={() => setStep(4)}
            onBack={() => setStep(2)}
          />
        </section>
      )}

      {step === 4 && (
        <section>
          <SectionHeader step={4} title="Confirmación" />
          <SendConfirmation
            selectedCount={selectedEmployeeIds.size}
            templateName={templateName}
            mode={mode}
            importFilename={importMeta?.filename ?? null}
            sending={sending}
            error={sendError}
            onConfirm={handleSend}
            onBack={() => setStep(3)}
          />
        </section>
      )}
      </div>
      </ScrollProgressPanel>
    </div>
  );
}

function SectionHeader({ step, title }: { step: number; title: string }) {
  return (
    <div className="mb-4">
      <p className="text-xs font-medium text-text-muted">Paso {step}</p>
      <h2 className="text-lg font-medium text-text-primary">{title}</h2>
    </div>
  );
}
