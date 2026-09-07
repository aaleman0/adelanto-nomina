import { describe, expect, it } from "vitest";
import { calculateLoanTotals } from "@/lib/contracts/loan-totals";

describe("calculateLoanTotals", () => {
  it("calcula total para 4,000", () => {
    expect(calculateLoanTotals(4000)).toEqual({
      principal: 4000,
      commission: 280,
      vat: 44.8,
      total: 4324.8,
    });
  });

  it("redondea correctamente montos con centavos", () => {
    expect(calculateLoanTotals(4677.75)).toEqual({
      principal: 4677.75,
      commission: 327.44,
      vat: 52.39,
      total: 5057.58,
    });
  });

  it("soporta montos grandes", () => {
    expect(calculateLoanTotals(1250000.75)).toEqual({
      principal: 1250000.75,
      commission: 87500.05,
      vat: 14000.01,
      total: 1351500.81,
    });
  });
});

