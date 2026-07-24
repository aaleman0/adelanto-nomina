---
name: adelantos-easylex
description: Integrar y mantener EasyLex en el flujo de adelantos: crear documentos de contrato, generar el PDF, obtener el link de firma, procesar el webhook de firma, guardar evidencia contractual y sincronizar estados con el backend. Use cuando se trabaje con la API de EasyLex, contract_id, signing_url, estados de contrato, callbacks, expiración o evidencia de firma.
---

# Adelantos EasyLex

## Lee primero

`docs/easylex-contratos.md` — ciclo de vida, reglas de negocio, generación de PDF, cliente y webhook.

Código: `src/lib/contracts/` (reglas) y `src/lib/easylex/` (cliente y PDF).

## Estado actual

La integración es **real y está funcionando**, no un mock. Documentación anterior la describía como pendiente; eso es obsoleto.

Existen dos rutas de generación de PDF: la activa usa `pdf-lib` sobre una plantilla con AcroForm; la alternativa usa Google Docs y requiere credenciales **en archivos** (`google_oauth_client.json`, `token.json`) en `process.cwd()`. Confirma cuál estás tocando antes de cambiar nada.

## Reglas que no se negocian

- **No llamar a EasyLex** si el empleado no tiene oferta vigente, elegible y cuenta bancaria activa.
- **No confiar en campos que lleguen desde fuera** si la base tiene datos normalizados.
- **Congelar el snapshot** al generar el link, para que cambios posteriores del CSV no alteren lo firmado.
- **TTL del link: 2 horas.** La constante `LINK_TTL_HOURS` está declarada en **tres archivos**; cambiarla exige tocar los tres.
- **Regenerar crea un intento nuevo**, nunca sobrescribe el anterior. El historial de `contract_attempts` debe quedar íntegro.
- **No revertir una firma** desde el backoffice.
- Guardar errores de EasyLex con código, mensaje, endpoint y correlación en `integration_logs`.

## Webhook de firma

- Idempotencia por `easylex_events.event_id` (índice único parcial). **Pero si falta `webhookId`, el id se sintetiza con `Date.now()` y nunca colisiona** — en ese caso no hay protección real.
- `DOCUMENT_SIGNED` cierra el ciclo y busca por `data.id`; `SIGNED_BY_USER` solo registra y busca por `data.documentId`. No es una errata: los payloads difieren.
- Responde **siempre `200`** para evitar reintentos. Un fallo solo es visible en `integration_logs`.
- La autenticación compara `x-easylex-signature` en tiempo constante (`verifySharedSecret`) y **falla cerrado en producción** si el secreto no está configurado.

## Trampas de configuración

`EASYLEX_BASE_URL` y `EASYLEX_SIGNING_LINK_BASE_URL` **apuntan al sandbox por defecto**. Sin definirlas explícitamente, producción firma contra pruebas.

`EASYLEX_CALLBACK_URL` debe terminar en `/api/webhooks/easylex/sign`.

Las claves `acreedor_banco`, `acreedor_cuenta`, `acreedor_clabe`, `testigo_1_nombre` y `testigo_2_nombre` de `company_settings` están **vacías**. Un contrato emitido sin llenarlas sale incompleto.

`POST /api/webhooks/easylex/mock-sign` está deshabilitado en producción (`404`), pero fuera de ella no tiene autenticación. Sigue siendo herramienta de desarrollo, nunca mecanismo operativo.

## Mapeo de estados

`created`/`sent` → `generado` · `signed` → `firmado` · `expired` → `expirado` · `failed` → `error`

Existe `getDocumentStatus()` pero **no hay job de polling**: la confirmación depende solo del webhook.
