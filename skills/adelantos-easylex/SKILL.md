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

La generación del PDF va por **Google Docs**, no por `pdf-lib`: `generateContractPdf` (`src/lib/easylex/contract-pdf.ts`) solo arma los placeholders y delega en `generateContractPdfFromGoogleDocs`. La plantilla con AcroForm (`src/lib/easylex/templates/contrato-prestamo.pdf`) y los scripts que la generaron son de un enfoque anterior y **no están conectados a nada** —`pdf-lib` ya no se usa en `src/`—. Las credenciales de Google pueden venir como contenido JSON (`GOOGLE_OAUTH_CLIENT_JSON`, `GOOGLE_TOKEN_JSON`, que ganan) o como archivo (`GOOGLE_OAUTH_CLIENT_PATH`, `GOOGLE_TOKEN_PATH`, por defecto en `process.cwd()`); la vía de la variable existe porque en Railway no se puede montar un archivo secreto.

## Reglas que no se negocian

- **No llamar a EasyLex** si el empleado no tiene oferta vigente, elegible y cuenta bancaria activa.
- **No confiar en campos que lleguen desde fuera** si la base tiene datos normalizados.
- **Congelar el snapshot** al generar el link, para que cambios posteriores del CSV no alteren lo firmado.
- **TTL del link: 24 horas.** `LINK_TTL_HOURS` vive en un solo archivo (`src/lib/contracts/link-ttl.ts`), junto con `LINK_TTL_MS` y el texto `DURACION_DEL_ENLACE` que leen los empleados. **No** es la ventana para pedir el adelanto: esa vive en `ventana-oferta.ts` (`VENTANA_OFERTA_HORAS`) y también vale 24 h, pero contadas desde que salió la oferta, no desde que se generó el contrato. Nunca derivar una de la otra: hay una prueba que lo impide.
- **Regenerar crea un intento nuevo**, nunca sobrescribe el anterior. El historial de `contract_attempts` debe quedar íntegro.
- **No revertir una firma** desde el backoffice.
- **Una firma que llega sobre una solicitud que ya no está en curso se guarda como evidencia pero NO revive la solicitud** (`queHacerConLaFirma`, `src/lib/contracts/firma-tardia.ts`). Solo `recibida`, `generando` y `link_generado` pasan a `firmado`; desde `reemplazada` —lo que deja un ciclo nuevo— se archiva el PDF sin avisarle a la persona y se registra `contract.signed_fuera_de_curso`. Revivirla metería un pago con el monto de un ciclo ya cerrado en el Excel de dispersión, y sin aparecer en el tablero. La lista de estados es blanca a propósito: uno nuevo cae del lado que no mueve dinero.
- Guardar errores de EasyLex con código, mensaje, endpoint y correlación en `integration_logs`.

## Webhook de firma

- Idempotencia por `easylex_events.event_id` (índice único parcial). **Pero si falta `webhookId`, el id se sintetiza con `Date.now()` y nunca colisiona** — en ese caso no hay protección real.
- `DOCUMENT_SIGNED` cierra el ciclo y busca por `data.id`; `SIGNED_BY_USER` solo registra y busca por `data.documentId`. No es una errata: los payloads difieren.
- Ante un error de procesamiento responde **`500`**, no `200`, para que EasyLex **reintente**: los manejadores son idempotentes, así que un fallo transitorio de la base no pierde la firma. Antes respondía `200` y la firma —que es la evidencia legal— se perdía en silencio. Por lo mismo, el intento se marca `firmado` AL FINAL de las escrituras críticas: es el guard de idempotencia, y marcarlo primero hacía que el reintento cortocircuitara sin haber escrito solicitud, oferta ni auditoría.
- La autenticación es `verifyEasylexWebhook`, que acepta **dos esquemas** de `x-easylex-signature` —secreto compartido plano, o HMAC-SHA256 del cuerpo crudo en hex con prefijo `sha256=` opcional—, ambos comparados en tiempo constante. Se admiten los dos porque no está confirmado cuál manda EasyLex y equivocarse deja el webhook rechazando todo con `401` en silencio; los dos exigen el secreto, así que no debilita nada. Por eso el handler lee `request.text()` y parsea después: reserializar el JSON invalidaría el HMAC. **Falla cerrado en producción** —o con `WEBHOOK_ENFORCE_SIGNATURES=true`— si el secreto no está configurado.

## Trampas de configuración

`EASYLEX_BASE_URL` **apunta al sandbox por defecto** (`https://sandboxapi.easylex.com`), donde la cuenta real no existe: sin definirla, nada autentica. `EASYLEX_SIGNING_LINK_BASE_URL` ya no tiene default —vale cadena vacía y `buildSigningUrl` lanza—, así que ahí el fallo es en voz alta: el intento queda en `error` en vez de entregar un link muerto que el empleado no podría abrir.

`EASYLEX_CALLBACK_URL` debe terminar en `/api/webhooks/easylex/sign`.

Las claves `acreedor_banco`, `acreedor_cuenta`, `acreedor_clabe`, `testigo_1_nombre` y `testigo_2_nombre` de `company_settings` están **vacías**. Un contrato emitido sin llenarlas sale incompleto.

`POST /api/webhooks/easylex/mock-sign` está **deshabilitado por defecto en todas partes**: exige `ENABLE_MOCK_SIGN="true"` **y** no estar en producción, y si falta cualquiera de las dos responde `404` (no `403`, para no delatar que existe). El doble cerrojo evita que un `NODE_ENV` mal fijado reabra por sí solo un endpoint que no tiene autenticación ninguna. Herramienta de desarrollo, nunca mecanismo operativo.

## Mapeo de estados

`created`/`sent` → `generado` · `signed` → `firmado` · `expired` → `expirado` · `failed` → `error`

No hay job de polling, pero `getDocumentStatus()` tiene **dos salidas manuales** para cuando el aviso automático no llega: "Comprobar si ya firmó" de una persona (`syncEmployeeSignature`) y "Actualizar estados" de un ciclo (`syncBatchSignatures`). Las dos marcan la firma con la misma lógica del webhook (`mockSignContract`) y son idempotentes; existen porque sin ellas una firma que el webhook no reflejara no tendría ninguna otra forma de llegar al expediente, y el caso suelto —alguien dado de alta a mano, sin lote— no se arreglaría ni sincronizando el ciclo.
