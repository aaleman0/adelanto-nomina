"use client";

import { useState, useCallback } from "react";
import { useNotifications } from "@/components/ui/notifications";
import { useToast } from "@/components/ui/toast";
import { WhatsAppReadinessCard, DEFAULT_TEMPLATE } from "./whatsapp-readiness-card";
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

const STEP_LABELS: Record<FlowStep, string> = {
  1: "Destinatarios",
  2: "Mensaje",
  3: "Revisión",
  4: "Confirmación",
  5: "Resultado",
};

function StepIndicator({
  current,
  done,
}: {
  current: FlowStep;
  done: boolean;
}) {
  const steps: FlowStep[] = [1, 2, 3, 4];

  if (done) return null;

  return (
    <nav className="flex items-center gap-0">
      {steps.map((step, idx) => {
        const isActive = step === current;
        const isCompleted = step < current;
        return (
          <div key={step} className="flex items-center">
            {idx > 0 && (
              <span
                className={[
                  "mx-1 h-px w-8 transition-colors sm:w-12",
                  isCompleted ? "bg-primary" : "bg-border",
                ].join(" ")}
              />
            )}
            <div className="flex flex-col items-center gap-1">
              <span
                className={[
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all",
                  isActive
                    ? "bg-primary text-white shadow-sm shadow-primary/30"
                    : isCompleted
                    ? "bg-emerald-500 text-white"
                    : "bg-surface-muted text-text-muted",
                ].join(" ")}
              >
                {isCompleted ? (
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : (
                  step
                )}
              </span>
              <span
                className={[
                  "hidden text-[10px] font-semibold sm:block",
                  isActive ? "text-primary" : isCompleted ? "text-emerald-600" : "text-text-disabled",
                ].join(" ")}
              >
                {STEP_LABELS[step]}
              </span>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

export function GuidedSendFlow() {
  const { addNotification } = useNotifications();
  const toastify = useToast();

  // Estado del flujo
  const [step, setStep] = useState<FlowStep>(1);
  const [mode, setMode] = useState<SendMode>("import");
  const [selectedImportId, setSelectedImportId] = useState("");
  const [importMeta, setImportMeta] = useState<RecentImport | null>(null);
  const [manualIds, setManualIds] = useState<string[]>([]);
  const [templateName, setTemplateName] = useState(DEFAULT_TEMPLATE);
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
      const payload =
        mode === "import"
          ? {
              mode: "import",
              importId: selectedImportId,
              employeeIds: [...selectedEmployeeIds],
              templateName,
            }
          : {
              mode: "manual",
              employeeIds: [...selectedEmployeeIds],
              templateName,
            };

      const res = await fetch("/api/whatsapp/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (!json.ok) throw new Error(json.error ?? "Error al enviar.");

      const r = json as SendResultType;
      setResult(r);
      setStep(5);

      toastify.success(
        `Envío completado: ${r.sent} enviado${r.sent !== 1 ? "s" : ""}${r.failed > 0 ? `, ${r.failed} errores` : ""}.`,
      );
      addNotification({
        type: r.failed > 0 ? "warning" : "success",
        title: "Envío masivo completado",
        message: `${r.sent} mensaje${r.sent !== 1 ? "s" : ""} enviado${r.sent !== 1 ? "s" : ""}${
          r.failed > 0 ? `, ${r.failed} fallido${r.failed !== 1 ? "s" : ""}` : ""
        }. Ver historial para detalles.`,
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
  }, [mode, selectedImportId, selectedEmployeeIds, templateName, toastify, addNotification]);

  // Paso 5: resultado
  if (step === 5 && result) {
    return (
      <SendResult
        result={result}
        templateName={templateName}
        onNewSend={resetFlow}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Tarjeta de estado de WhatsApp */}
      <WhatsAppReadinessCard />

      {/* Indicador de pasos */}
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface px-5 py-4">
        <StepIndicator current={step} done={step === 5} />
        <p className="hidden text-xs text-text-muted sm:block">
          Paso {step} de 4: <span className="font-semibold text-text-primary">{STEP_LABELS[step]}</span>
        </p>
      </div>

      {/* Paso 1: Destinatarios */}
      {step === 1 && (
        <section>
          <SectionHeader
            step={1}
            title="¿A quién quieres enviarle el mensaje?"
            description="Elige cómo seleccionar a los empleados que recibirán el mensaje de WhatsApp."
          />
          <RecipientStep
            mode={mode}
            selectedImportId={selectedImportId}
            manualIds={manualIds}
            onModeChange={(m) => {
              setMode(m);
              setValidation(null);
              setSelectedEmployeeIds(new Set());
            }}
            onImportChange={(id) => {
              setSelectedImportId(id);
              setValidation(null);
              setSelectedEmployeeIds(new Set());
            }}
            onManualIdsChange={setManualIds}
            onNext={() => setStep(2)}
          />
        </section>
      )}

      {/* Paso 2: Mensaje */}
      {step === 2 && (
        <section>
          <SectionHeader
            step={2}
            title="¿Qué mensaje quieres enviar?"
            description="Usamos la plantilla aprobada por Meta para adelantos de nómina."
          />
          <MessageTemplateStep
            templateName={templateName}
            onTemplateChange={setTemplateName}
            onNext={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        </section>
      )}

      {/* Paso 3: Revisión de elegibilidad */}
      {step === 3 && (
        <section>
          <SectionHeader
            step={3}
            title="Revisa quién va a recibir el mensaje"
            description="Verificamos automáticamente cuáles empleados cumplen los requisitos. Puedes ajustar la selección."
          />
          <EligibilitySummary
            mode={mode}
            importId={selectedImportId}
            employeeIds={manualIds}
            templateName={templateName}
            validation={validation}
            selectedEmployeeIds={selectedEmployeeIds}
            onValidationChange={(v) => {
              setValidation(v);
              // Guarda el filename de importación para el resumen
              if (mode === "import" && v.employees.length > 0) {
                // Intentar recuperar el filename de los imports cargados (se pasa por el state padre)
              }
            }}
            onSelectionChange={setSelectedEmployeeIds}
            onNext={() => setStep(4)}
            onBack={() => setStep(2)}
          />
        </section>
      )}

      {/* Paso 4: Confirmación */}
      {step === 4 && (
        <section>
          <SectionHeader
            step={4}
            title="Confirma el envío"
            description="Este es el último paso antes de enviar los mensajes."
          />
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
  );
}

function SectionHeader({
  step,
  title,
  description,
}: {
  step: number;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-4">
      <p className="text-[11px] font-bold uppercase tracking-widest text-primary">Paso {step}</p>
      <h2 className="mt-1 text-lg font-bold text-text-primary">{title}</h2>
      <p className="mt-0.5 text-sm text-text-muted">{description}</p>
    </div>
  );
}
