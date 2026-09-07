export type LoanTotals = {
  principal: number;
  commission: number;
  vat: number;
  total: number;
};

const COMMISSION_RATE = 0.07;
const VAT_RATE = 0.16;

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateLoanTotals(principal: number): LoanTotals {
  const commission = roundMoney(principal * COMMISSION_RATE);
  const vat = roundMoney(commission * VAT_RATE);
  const total = roundMoney(principal + commission + vat);

  return {
    principal: roundMoney(principal),
    commission,
    vat,
    total,
  };
}

