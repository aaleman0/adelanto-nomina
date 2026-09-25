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
| `verify-contracts-batch.ts` | **Verificación de generación (night-run).** Solo lectura: audita qué empleados generarían contrato completo + renderiza empleados listos y una batería sintética, extrae el texto y verifica cada campo. Evidencia en `scripts/contract-verify-out/<runId>/`. Flags: `--audit-only`, `--synthetic-only`, `--no-synthetic`, `--render=N`, `--offset=K` | alias `@/`, `.env.local`, Google (salvo `--audit-only`) |
| `fix-contract-template.ts` | Arregla el bug de formato del monto en la plantilla de Google Docs (quita `.00` y `PESOS 00/100 MONEDA NACIONAL` hardcodeados). Dry-run por defecto; `--apply` para aplicar. **Ya aplicado 2026-07-31** | alias `@/`, Google, **muta el Doc** |
| `add-acreedor-placeholders.ts` | Convierte la identidad del acreedor (razón social, RFC, representante, domicilio) de texto fijo a placeholders `{{...}}`. Dry-run por defecto; `--apply`. **Ya aplicado 2026-07-31** | alias `@/`, Google, **muta el Doc** |
| `inspect-template.ts` | Vuelca el texto real de la plantilla y muestra placeholders y blancos. Solo lectura; útil antes de mutar | alias `@/`, Google |
| `setup-test-employee.ts` | Deja **un empleado de prueba LISTO** para el pipeline (datos personales completos + oferta elegible + cuenta activa). Persiste; `--cleanup --rfc=…` para borrarlo. Args: `--telefono`, `--rfc`, `--nombre`, `--apellido-paterno`, `--email`, `--monto`… Para la [primera prueba E2E](primera-prueba-e2e.md) | alias `@/`, `.env.local`, **muta la DB** |
| `demo-contract-from-db.ts` | Demuestra que con los datos EN la DB el contrato sale completo: llena un empleado, genera el PDF y **revierte**. Prueba de un solo tiro | alias `@/`, Google |
| `google-auth.ts` | Autorización OAuth de Google, **una sola vez**: genera `token.json` en la raíz, que es lo que `src/lib/google/auth.ts` necesita para copiar la plantilla y exportarla a PDF. Sin ese token no se genera ningún contrato. Requiere `google_oauth_client.json` (tipo "Desktop app") y las APIs de Drive y Docs activas; abre un servidor en `localhost:3333` para el redirect | credenciales OAuth en la raíz |
| `trigger-contract.ts` | Dispara el pipeline completo para un RFC desde la terminal, sin navegador ni sesión: llama directo a `requestContractFromWhatsApp`. Args: `--rfc=`, `--callback=`, `--allow-no-callback` | alias `@/`, `.env.local`, **EFECTOS REALES: crea documento en EasyLex (gasta firma) y manda un WhatsApp** |
| `fetch-signed-contract.ts` | Descarga el PDF **firmado** de un documento de EasyLex sin depender del webhook ni de un deploy público. Args: `--doc=doc-XXXX` o `--rfc=` (toma el último intento) | alias `@/`, `.env.local` |
| `fix-template-text.ts` | Correcciones puntuales de TEXTO en la plantilla de Google Docs (typos). Verifica que cada cadena aparezca el número esperado de veces antes de tocar nada. Dry-run por defecto; `--apply` | alias `@/`, Google, **muta el Doc** |
| `create-pdf-template-fixed.ts` | Generador de un solo uso: estampa el AcroForm sobre el PDF original y escribe `src/lib/easylex/templates/contrato-prestamo.pdf`. Contiene la tabla de coordenadas de cada campo | ruta absoluta local |
| `inspect-pdf.ts` | Abre un PDF con `pdf-lib` y muestra páginas, dimensiones y campos de formulario existentes | ruta absoluta local |
| `extract-pdf-text.ts` | Decodifica los content streams del PDF y extrae el texto de los operadores `Tj` y `TJ` | ruta absoluta local |

> Los tres últimos tienen **codificada la ruta absoluta** `/Users/joseangel/Downloads/LOZAV Préstamo mercantil V2.pdf`. Solo funcionan en la máquina del autor; en otra hay que editar la constante. Se conservan porque documentan cómo se construyó la plantilla del contrato.

`verify-whatsapp-setup.ts` es el único de utilidad operativa recurrente, y `google-auth.ts` se corre una vez por máquina o cuenta. El resto se reparte entre el trabajo puntual sobre el PDF del contrato y las pruebas de extremo a extremo del pipeline (`trigger-contract.ts`, `fetch-signed-contract.ts`).

## Diagnóstico de EasyLex (`*.mjs`)

Scripts sueltos que corren con **`node` directo** (no necesitan `tsx`): leen `.env.local` a mano y **no imprimen secretos**. Son las herramientas con las que se resolvió la integración de EasyLex (ver [EasyLex y contratos](easylex-contratos.md)).

```bash
node scripts/<archivo>.mjs
```

| Script | Qué hace | Ojo |
|---|---|---|
| `test-easylex.mjs` | Smoke test de credenciales: consulta el estado de un documento inexistente. `106` = llaves mal, `2905` = autenticó OK | No gasta firma |
| `probe-easylex-create.mjs` | Sonda de `createDocument` para ver qué campo rechaza la API. Args: `<type> <validaciones>` | Un `200` **crea documento y gasta firma** |
| `probe-easylex-widget.mjs` | Datos del signer/widget de un `signerId` (revela el `sessionToken`) | Solo lectura |
| `dump-easylex-settings.mjs` | Imprime las banderas `easylex_validate_*` de `company_settings` | Solo lectura |
| `inspect-employee.mjs` | Estado de contrato de un empleado por RFC (oferta, solicitudes, intentos, banco) | Solo lectura |
| `demo-webhook-sign.mjs` | Prueba E2E del webhook de firma: crea un contrato mock, dispara `DOCUMENT_SIGNED` al handler real (firma HMAC si hay secreto), verifica y limpia | **Requiere dev server**; no gasta firma |
| `solicitar-link.mjs` | No es diagnóstico de EasyLex, pero corre igual con `node` y es donde se lo busca: genera un link `/solicitar/<token>` firmado para probar el auto-servicio en el navegador de la laptop, sin celular, sin túnel y sin plantilla de WhatsApp. Réplica exacta de `signSolicitarToken`. Args: `[employeeId]` | Lee `SOLICITAR_TOKEN_SECRET`; imprime **solo la URL**, no el secreto |
| `set-easylex-validation.mjs` | Deja `company_settings` en la combinación de validación que EasyLex acepta: biométrico y prueba de vida exigen `id` y `picture` en true | **muta la DB** |
| `probe-easylex-sendemail.mjs` | Crea un documento con `sendEmail=true` para ver el formato exacto de la URL de firma canónica que manda EasyLex. Args: `<email>` | **Gasta 1 firma y manda 1 correo** |

Ver también: [EasyLex y contratos](easylex-contratos.md) · [WhatsApp](whatsapp.md)
