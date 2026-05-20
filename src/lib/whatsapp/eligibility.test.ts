import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateEligibility,
  getEmployeesEligibility,
  type EligibilityResult,
} from "./eligibility";
import { getSupabaseAdmin } from "@/lib/supabase/server";

// Mock de Supabase
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockMaybeSingle = vi.fn();
const mockIn = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: vi.fn(() => ({
      select: mockSelect.mockReturnThis(),
      eq: mockEq.mockReturnThis(),
      in: mockIn.mockReturnThis(),
      maybeSingle: mockMaybeSingle,
    })),
  })),
}));

describe("validateEligibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("debe retornar elegible=true cuando todas las condiciones se cumplen", async () => {
    // Mock de oferta válida
    mockSelect.mockReturnValueOnce({
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValueOnce({
        data: {
          id: "offer-1",
          is_eligible: true,
          status: "elegible",
          employee_id: "emp-1",
        },
        error: null,
      }),
    });

    // Mock de cuenta bancaria
    mockSelect.mockReturnValueOnce({
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValueOnce({
        data: { id: "bank-1" },
        error: null,
      }),
    });

    const result = await validateEligibility("emp-1");

    expect(result.eligible).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("debe retornar elegible=false cuando no hay oferta", async () => {
    mockSelect.mockReturnValueOnce({
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValueOnce({
        data: null,
        error: null,
      }),
    });

    const result = await validateEligibility("emp-1");

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("Sin oferta vigente");
  });

  it("debe retornar elegible=false cuando la oferta no es elegible", async () => {
    mockSelect.mockReturnValueOnce({
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValueOnce({
        data: {
          id: "offer-1",
          is_eligible: false,
          status: "elegible",
          employee_id: "emp-1",
        },
        error: null,
      }),
    });

    const result = await validateEligibility("emp-1");

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("Oferta no elegible");
  });

  it("debe retornar elegible=false cuando la oferta está rechazada", async () => {
    mockSelect.mockReturnValueOnce({
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValueOnce({
        data: {
          id: "offer-1",
          is_eligible: true,
          status: "rechazada",
          employee_id: "emp-1",
        },
        error: null,
      }),
    });

    const result = await validateEligibility("emp-1");

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("Oferta rechazada");
  });

  it("debe retornar elegible=false cuando la oferta ya está solicitada", async () => {
    mockSelect.mockReturnValueOnce({
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValueOnce({
        data: {
          id: "offer-1",
          is_eligible: true,
          status: "solicitada",
          employee_id: "emp-1",
        },
        error: null,
      }),
    });

    const result = await validateEligibility("emp-1");

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("Oferta ya en estado: solicitada");
  });

  it("debe retornar elegible=false cuando la oferta ya está firmada", async () => {
    mockSelect.mockReturnValueOnce({
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValueOnce({
        data: {
          id: "offer-1",
          is_eligible: true,
          status: "firmada",
          employee_id: "emp-1",
        },
        error: null,
      }),
    });

    const result = await validateEligibility("emp-1");

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("Oferta ya en estado: firmada");
  });

  it("debe retornar elegible=false cuando no hay cuenta bancaria", async () => {
    // Mock de oferta válida
    mockSelect.mockReturnValueOnce({
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValueOnce({
        data: {
          id: "offer-1",
          is_eligible: true,
          status: "elegible",
          employee_id: "emp-1",
        },
        error: null,
      }),
    });

    // Mock de cuenta bancaria inexistente
    mockSelect.mockReturnValueOnce({
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValueOnce({
        data: null,
        error: null,
      }),
    });

    const result = await validateEligibility("emp-1");

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("Sin cuenta bancaria activa");
  });
});

describe("getEmployeesEligibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("debe retornar array vacío cuando no hay employeeIds", async () => {
    const result = await getEmployeesEligibility([]);
    expect(result).toEqual([]);
  });

  it("debe evaluar múltiples employees correctamente", async () => {
    const mockEmployees = [
      {
        id: "emp-1",
        nombre: "Juan",
        apellidos: "Pérez",
        rfc: "ABC123",
        telefono_normalizado: "521234567890",
        empleador: "Empresa A",
      },
      {
        id: "emp-2",
        nombre: "María",
        apellidos: "García",
        rfc: "DEF456",
        telefono_normalizado: "529876543210",
        empleador: "Empresa B",
      },
    ];

    const mockOffers = [
      {
        employee_id: "emp-1",
        id: "offer-1",
        is_eligible: true,
        status: "elegible",
        monto_prestamo_autorizado: 5000,
      },
      {
        employee_id: "emp-2",
        id: "offer-2",
        is_eligible: true, // Nota: is_eligible debe ser true para que se revise el status
        status: "rechazada",
        monto_prestamo_autorizado: null,
      },
    ];

    const mockBanks = [{ employee_id: "emp-1" }];

    // Setup mocks para getEmployeesEligibility
    const mockFrom = vi.fn();
    let callCount = 0;

    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (callCount === 1) {
        // employees query
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValueOnce({ data: mockEmployees, error: null }),
        };
      } else if (callCount === 2) {
        // offers query
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValueOnce({ data: mockOffers, error: null }),
        };
      } else {
        // banks query
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValueOnce({ data: mockBanks, error: null }),
        };
      }
    });

    vi.mocked(getSupabaseAdmin).mockReturnValue({ from: mockFrom } as any);

    const result = await getEmployeesEligibility(["emp-1", "emp-2"]);

    expect(result).toHaveLength(2);
    expect(result[0].eligible).toBe(true);
    expect(result[0].reason).toBeUndefined();
    expect(result[1].eligible).toBe(false);
    expect(result[1].reason).toBe("Oferta rechazada");
  });
});
