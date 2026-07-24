import { numberToWords } from "@komandero/numeros-a-letras";

export function montoEnLetra(monto: number): string {
  const [enterosStr, centavos] = monto.toFixed(2).split(".");
  const enteros = Number(enterosStr);
  const enterosLetra = numberToWords(enteros, { unit: "PESO" });
  return `${enterosLetra} ${centavos}/100 M.N.`;
}
