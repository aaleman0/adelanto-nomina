# Scripts

Utilidades en `scripts/`. **Ninguna está conectada a `package.json`**: se ejecutan a mano.

Los que usan el alias `@/` necesitan un runner que resuelva los paths de `tsconfig.json`. `ts-node` **no está en las dependencias**, así que `tsx` es la opción práctica:

```bash
pnpm dlx tsx scripts/<archivo>.ts
```

| Script | Qué hace | Requisitos |
|---|---|---|
| `verify-whatsapp-setup.ts` | Valida las variables de WhatsApp con `validateWhatsAppEnv()`, consulta `/api/health/whatsapp` e informa conectividad con Supabase, tablas presentes y estado de configuración | **Servidor dev corriendo** en `localhost:3000` |
| `test-fill-contract.ts` | Smoke test de `generateContractPdf`: rellena un contrato con datos fijos y escribe `scripts/test-filled-contract.pdf` | alias `@/` |
| `generate-test-contracts.ts` | Genera varios contratos vía `generateContractPdfFromGoogleDocs` en `./scripts/contratos-generados`. Los casos ejercitan variantes de teléfono (`8118-088601`, `81 8018 8991`), de monto (`15250.5`, `1250000.75`, `5000`) y un apellido materno ausente | alias `@/`, credenciales de Google en archivos |
| `create-pdf-template-fixed.ts` | Generador de un solo uso: estampa el AcroForm sobre el PDF original y escribe `src/lib/easylex/templates/contrato-prestamo.pdf`. Contiene la tabla de coordenadas de cada campo | ruta absoluta local |
| `inspect-pdf.ts` | Abre un PDF con `pdf-lib` y muestra páginas, dimensiones y campos de formulario existentes | ruta absoluta local |
| `extract-pdf-text.ts` | Decodifica los content streams del PDF y extrae el texto de los operadores `Tj` y `TJ` | ruta absoluta local |

> Los tres últimos tienen **codificada la ruta absoluta** `/Users/joseangel/Downloads/LOZAV Préstamo mercantil V2.pdf`. Solo funcionan en la máquina del autor; en otra hay que editar la constante. Se conservan porque documentan cómo se construyó la plantilla del contrato.

`verify-whatsapp-setup.ts` es el único de utilidad operativa recurrente. El resto pertenece al trabajo puntual sobre el PDF del contrato.

Ver también: [EasyLex y contratos](easylex-contratos.md) · [WhatsApp](whatsapp.md)
