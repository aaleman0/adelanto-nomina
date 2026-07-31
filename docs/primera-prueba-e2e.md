# Primera prueba real end-to-end

Objetivo: probar **las 8 etapas encadenadas con UN empleado de prueba**, en un entorno público, **antes** de soltar el envío a los ~600. Cada paso dice quién lo hace y **cómo se verifica**.

Convención: 🧑 = lo haces tú (config/dashboard/persona) · 🤖 = verificable con un script.

Herramienta estrella de observación en todo el proceso: **`node scripts/inspect-employee.mjs <RFC>`** — muestra oferta, solicitudes, intentos, banco, `signing_url` y estados. Corre esto tras cada eslabón para ver avanzar el expediente.

---

## Antes de empezar: 3 prerrequisitos duros

1. **🧑 Entorno público desplegado.** EasyLex y Meta necesitan **llamar de vuelta** al webhook; no alcanzan `localhost`. Puede ser un deploy de staging idéntico a prod o el prod real.
2. **🧑 Un empleado de prueba controlado**, con TODO esto:
   - Datos personales completos (`estado_civil`, `nacionalidad`, `lugar_origen`, `fecha_nacimiento`, `domicilio`) — recuerda: el empleado **no** puede rellenar huecos, el contrato debe salir completo.
   - Oferta vigente y **elegible** + **CLABE activa**.
   - Un **teléfono que tú controles** (para hacer clic y completar los biométricos con un INE real).
3. **🧑 Las 5 claves `(LLENAR)` de `company_settings`** llenas (banco/cuenta/CLABE del acreedor + 2 testigos), desde "Datos de empresa". La identidad del acreedor ya tiene respaldo, no bloquea.

> Verifica los prerrequisitos 1 y 2 de un golpe: `pnpm dlx tsx scripts/verify-contracts-batch.ts --audit-only` → el empleado de prueba debe aparecer entre los "listos". Y `node scripts/inspect-employee.mjs <RFC>` para confirmar oferta + CLABE.

---

## Fase 1 — Encender (config e infra)

| Paso | Verificar |
|---|---|
| 🧑 Deploy a Cloud Run con URL pública + `NEXT_PUBLIC_APP_URL` real | La portada carga con sesión |
| 🧑 Montar credenciales de Google (`google_oauth_client.json` + `token.json`) en el contenedor | Sin esto **ningún** contrato se genera (falla con `ENOENT`) |
| 🧑 Env vars de prod: `EASYLEX_BASE_URL=https://api.easylex.com`, `EASYLEX_SIGNING_LINK_BASE_URL=https://easylex.com/documento/firma`, llaves de EasyLex/WhatsApp/Supabase | — |
| 🧑 WhatsApp: **token permanente** (System User) + `WHATSAPP_APP_SECRET` | `GET /api/health/whatsapp` en verde; el banner de salud del portal sin alertas |
| 🤖 Credenciales de EasyLex | `node scripts/test-easylex.mjs` → `2905` (autenticó OK), no `106` |

---

## Fase 2 — Cablear los dos webhooks

| Paso | Verificar |
|---|---|
| 🧑 Meta → `https://<dominio>/api/webhooks/whatsapp` + verify token | Meta marca el webhook como **verificado** |
| 🧑 EasyLex (su dashboard) → callback `https://<dominio>/api/webhooks/easylex/sign` + secreto = `EASYLEX_WEBHOOK_SECRET` de prod | Se confirma en Fase 3 con el pre-vuelo |
| 🧑 Confirmar con EasyLex el **esquema de firma** del webhook (HMAC vs secreto plano) | El handler acepta ambos, pero conviene saber cuál mandan |

---

## Fase 3 — Pre-vuelo (de-risk, SIN enviar WhatsApp todavía)

Aquí se prueba lo más incierto **antes** de meter a una persona real.

1. **🤖 El contrato del empleado de prueba sale completo.** Genera y revisa su PDF (que no tenga huecos ni `{{...}}`). Con el verificador apuntando a ese RFC, o con la corrida sintética + su render real.
2. **🤖 Prueba el camino webhook → registro → entrega SIN firma real:** `node scripts/demo-webhook-sign.mjs`.
   - Crea un contrato mock, dispara `DOCUMENT_SIGNED` al **handler real** (con firma HMAC si hay secreto), verifica que propague a `firmado` + `audit_events`, y limpia.
   - **Esto prueba las etapas 6–8 en el entorno real** sin gastar una firma ni depender de EasyLex. Si esto pasa en prod, la única incógnita que queda es la **forma exacta del payload real** de EasyLex.
3. **🧑 Plantilla de WhatsApp aprobada.** `adelanto_contrato_listo` (UTILITY) aprobada en Meta con el **botón URL dinámico**: base `https://easylex.com/documento/firma/` + `{{1}}`.

---

## Fase 4 — La corrida real (una persona)

> **Abre la ventana de 24 h primero.** Para que el **PDF firmado regrese automático** por WhatsApp, el empleado debe tener una sesión abierta: que **envíe cualquier mensaje** ("hola") al número del negocio antes de firmar. Hacer clic en el botón del link **no** abre sesión. Sin sesión, el PDF **igual se archiva** y se reenvía a mano desde el backoffice (no se pierde).

| # | Etapa | Acción | Cómo verificar |
|---|---|---|---|
| 1 | Disparar | 🧑 Desde el portal, pide el contrato para el RFC de prueba (o `POST /api/whatsapp/request-contract`) | Respuesta con `link_easylex` y `link_enviado: true` |
| 2 | Contrato generado | 🤖 | `inspect-employee.mjs <RFC>` → intento en `generado`, con `signing_url` |
| 3 | Doc en EasyLex | 🤖 | El mismo intento trae `easylex_contract_id` |
| 4 | Link enviado | 🤖 | Fila en `whatsapp_contract_messages` (`message_type='contract_link'`) |
| 5 | Recibe y abre | 🧑 (tu teléfono) | Llega el WhatsApp; el botón abre `easylex.com/documento/firma/<signerId>` |
| 6 | Valida + firma | 🧑 (tu teléfono, INE real) | Completa INE + selfie + prueba de vida y firma |
| 7 | Webhook de firma | 🤖 | Logs del webhook; `audit_events` con `contract.signed`; `inspect-employee` → `firmado` |
| 8 | PDF firmado de vuelta | 🤖 | `contract_attempts.signed_pdf_path` con archivo; `audit_events` `contract.signed_delivered`; llega el PDF al WhatsApp |

Si algo se atora, ve la tabla de diagnóstico de abajo. El expediente del backoffice (`/contracts/[employeeId]`) debe terminar en **Firmado** con botón para descargar/reenviar el PDF.

---

## Fase 5 — Compuerta antes de los 600

**No toques a los 600 hasta que UNA firma real complete las 8 etapas.** Recién entonces:

1. 🧑 Importar el **CSV completo** de empleados (los datos personales que hoy faltan en 605/608).
2. 🤖 `verify-contracts-batch.ts --audit-only` → confirmar que ahora la mayoría queda "listos".
3. 🧑 Enviar por lotes (la cola de envío ya existe), vigilando los primeros con `inspect-employee`.
4. 🧑 Encender los flips de endurecimiento (`RBAC_ENFORCEMENT=enforce`, `RLS_SESSION_READS=on` tras M1, `WEBHOOK_ENFORCE_SIGNATURES=true`) y correr `pnpm verify:rls`.

---

## Diagnóstico rápido por eslabón

| Síntoma | Dónde mirar / causa probable |
|---|---|
| No se genera el contrato | Credenciales de Google no montadas (`ENOENT`); o datos del empleado incompletos |
| `106` al crear en EasyLex | Llave/ambiente mal (`EASYLEX_BASE_URL` + resetear llaves) |
| `502 InvalidRequest` al crear | Config de validaciones inconsistente (biométrico/liveness exigen id+picture; ya se fuerza en código) |
| El link abre "sitio no disponible" | `EASYLEX_SIGNING_LINK_BASE_URL` mal; debe ser `easylex.com/documento/firma` |
| No llega el WhatsApp del link | Token/plantilla; `link_enviado:false` en la respuesta; el contrato igual quedó generado |
| Firma hecha pero expediente no pasa a Firmado | Webhook no cableado / secreto distinto en el dashboard de EasyLex; revisar logs del webhook |
| No regresa el PDF firmado | Ventana de 24 h cerrada (el empleado no escribió) → archivado; reenviar desde el backoffice |

---

## Por qué la ventana de 24 h

WhatsApp solo deja al negocio mandar un mensaje **libre** (como el PDF firmado) dentro de las **24 h** desde el **último mensaje del empleado**. Tocar el botón del link **no** cuenta como mensaje. Por eso, para la prueba, haz que tu teléfono **escriba algo** al número del negocio antes de firmar. En producción esto lo resuelve el primer contacto (cuando el empleado responde). Si la ventana está cerrada, el PDF **no se pierde**: queda archivado y el operador lo reenvía.

Ver también: [Go-live](go-live.md) · [EasyLex y contratos](easylex-contratos.md) · [WhatsApp](whatsapp.md)
