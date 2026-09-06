import { describe, expect, it } from "vitest";
import { buildContractPlaceholders } from "@/lib/easylex/contract-pdf";

describe("buildContractPlaceholders", () => {
  it("separa monto principal y total a pagar con comisión e IVA", () => {
    const placeholders = buildContractPlaceholders({
      nombreCompleto: "Karina Martinez Perez",
      apellidoPaterno: "Martinez",
      apellidoMaterno: "Perez",
      rfc: "MAPK940214JH1",
      curp: "MAPK940214MNLRKR08",
      email: "karina@example.com",
      empleador: "CONEXION CONTABLE",
      monto: 4000,
      clabe: "012345678901234567",
      banco: "BBVA",
      estadoCivil: "soltera",
      nacionalidad: "mexicana",
      lugarOrigen: "Hidalgo",
      fechaNacimiento: "2000-02-26",
      domicilio: "Calle Prueba 123",
      fechaFirma: new Date("2026-08-26T12:00:00Z"),
      companySettings: {
        acreedor_razon_social: "LOZAV CONSTRUCTORES, SOCIEDAD ANONIMA DE CAPITAL VARIABLE",
        acreedor_representante: "DARA JAHDAI LOPEZ DE LOS ANGELES",
        acreedor_rfc: "LCO2105032T5",
        acreedor_domicilio: "Del Gran Parque numero 225",
        acreedor_banco: "BBVA",
        acreedor_cuenta: "0123456789",
        acreedor_clabe: "012345678901234567",
        testigo_1_nombre: "TESTIGO UNO",
        testigo_2_nombre: "TESTIGO DOS",
      },
    });

    expect(placeholders.monto_numero).toBe("4,000.00");
    expect(placeholders.monto_letra).toContain("CUATRO MIL");
    expect(placeholders.total_pago_numero).toBe("4,324.80");
    expect(placeholders.total_pago_letra).toContain("CUATRO MIL TRESCIENTOS VEINTICUATRO");
  });
});

