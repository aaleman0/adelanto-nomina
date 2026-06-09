// Tipos compartidos del flujo guiado de envío masivo

export type SendMode = "import" | "manual";

export type RecentImport = {
  id: string;
  filename: string | null;
  total_rows: number | null;
  applied_at: string | null;
};

export type EmployeeRow = {
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

export type ValidationSummary = {
  total: number;
  eligible: number;
  notEligible: number;
  noPhone: number;
  employees: EmployeeRow[];
};

export type SendResult = {
  total: number;
  eligible: number;
  sent: number;
  failed: number;
  bulkSendId?: string;
  errors: Array<{ employeeId: string; rfc?: string | null; error: string }>;
};

// Pasos del flujo: 1=destinatarios, 2=mensaje, 3=revisión, 4=confirmación, 5=resultado
export type FlowStep = 1 | 2 | 3 | 4 | 5;

export type FlowState = {
  step: FlowStep;
  mode: SendMode;
  // Paso 1 — destinatarios
  selectedImportId: string;
  manualIds: string[];
  // Paso 2 — mensaje
  templateName: string;
  // Paso 3 — validación
  validation: ValidationSummary | null;
  selectedEmployeeIds: Set<string>;
  // Paso 4/5 — envío
  sending: boolean;
  result: SendResult | null;
  error: string | null;
};
