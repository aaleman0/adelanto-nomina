# EasyLex y contratos

Todo lo relacionado con generar el contrato, obtener el link de firma y confirmar la firma.

Código: `src/lib/contracts/` (reglas de negocio), `src/lib/easylex/` (cliente API y PDF).

## Ciclo de vida

```
advance_offers (vigente, elegible)
      │
      │  POST /api/whatsapp/request-contract
      ▼
contract_requests          una por oferta — UNIQUE (offer_id)
      │
      │  un intento por generación de link
      ▼
contract_attempts          attempt_number 1, 2, 3…  TTL 24 h
      │
      │  el empleado firma en EasyLex
      ▼
POST /api/webhooks/easylex/sign   (DOCUMENT_SIGNED)
      │
      ▼
attempt → firmado · request → firmado · offer → firmada
      │
      │  deliverSignedContract (best-effort, no-fatal)
      ▼
PDF firmado → bucket contratos-firmados → WhatsApp al empleado
```

## Reglas de negocio

Implementadas en `requestContractFromWhatsApp()` (`src/lib/contracts/request-contract.ts`):

1. **Identidad por RFC.** Se busca el empleado por RFC, nunca por teléfono. Si no existe → `not_found`.
2. **Oferta vigente y elegible.** Sin oferta `is_current` → `no_offer`. Con oferta no elegible → `not_eligible`.
3. **Cuenta bancaria activa: la exige la importación del CSV, no esta función.** Toda fila sin CLABE de 18 dígitos se rechaza al importar, así que en la práctica todo empleado con oferta tiene cuenta. Pero `requestContractFromWhatsApp` **no lo comprueba**: lee la cuenta activa, la pasa al generador y, si no hay, genera el contrato igual. No usar este paso como guardia: la guardia está en el CSV.
4. **Una solicitud por oferta.** Garantizado por `UNIQUE (offer_id)` y por el índice parcial que impide más de una solicitud activa por empleado.
5. **Si ya firmó** → `already_signed`, sin generar nada nuevo.
6. **Si hay un link vigente, se reutiliza.** No se crea un intento nuevo mientras el anterior no expire.
7. **Si el link expiró, se regenera como nuevo intento** dentro de la misma solicitud.
8. **Snapshot congelado.** Al crear la solicitud se guarda `contract_snapshot` con nombre, apellidos, RFC, CURP, CLABE, banco, monto, empleador, teléfono, email y procedencia. Una reimportación posterior no altera lo firmado.

`LINK_TTL_HOURS = 24`, declarado en un solo archivo (`src/lib/contracts/link-ttl.ts`) del que salen también `LINK_TTL_MS` y el texto `DURACION_DEL_ENLACE` que ven los empleados. Cambiar el plazo es cambiar ese número. **No** toca la ventana para pedir el adelanto, que vive aparte en `ventana-oferta.ts` (24 h desde que salió la oferta). Coinciden en el número; no derivar una de la otra.

## Generación del PDF

> **Requisito de despliegue crítico.** La generación de contratos **depende de Google Docs**, y sus credenciales entran por dos vías, con precedencia: como **contenido JSON** en `GOOGLE_OAUTH_CLIENT_JSON` y `GOOGLE_TOKEN_JSON` —esa gana si está puesta—, o como **archivo** en las rutas de `GOOGLE_OAUTH_CLIENT_PATH` / `GOOGLE_TOKEN_PATH`, que por defecto son `google_oauth_client.json` y `token.json` en `process.cwd()`. La vía de la variable existe porque en Railway no hay forma de montar un archivo secreto dentro del contenedor: sin ella, producción falla al generar el PDF y desde fuera solo se ve "no se pudo generar tu contrato", sin pista de la causa. Sin ninguna de las dos, `generateContractPdf` lanza **antes** de que se llame a EasyLex: la API no devuelve error HTTP, la solicitud queda en `error` con `contract_link_failed` y la persona aparece en el tablero de Pendientes bajo "Con error", lista para reintentar.

El nombre despista: `generateContractPdf` vive en `src/lib/easylex/contract-pdf.ts` y parece la ruta de `pdf-lib`, pero **delega en Google Docs**:

```
create-easylex-attempt.ts
  └─ generateContractPdf            (easylex/contract-pdf.ts)
       └─ generateContractPdfFromGoogleDocs   (google/contract-pdf.ts)  ← usa Google
```

`easylex/contract-pdf.ts` solo prepara los datos —incluido el monto en letra— y delega. El `TEMPLATE_DOC_ID` del documento de Google está hardcodeado. El mapeo campo→placeholder vive en **`buildContractPlaceholders()`** (exportada): es la **única fuente de verdad** de qué dato llena cada `{{...}}`. La usan tanto el render real como el verificador (`scripts/verify-contracts-batch.ts`), así que no hay lógica duplicada que se desincronice.

La plantilla PDF con AcroForm (`src/lib/easylex/templates/contrato-prestamo.pdf`) y los scripts que la generaron (`create-pdf-template-fixed.ts`, `inspect-pdf.ts`, `extract-pdf-text.ts`) corresponden a un enfoque anterior con `pdf-lib` que **ya no está conectado a nada**. Se conservan pero no participan en el flujo.

El monto se escribe también en letra mediante `montoEnLetra()` (`src/lib/easylex/monto-en-letra.ts`), sobre `@komandero/numeros-a-letras`.

## Datos que necesita el contrato

Del empleado (`employees`): nombre, `apellido_paterno`, `apellido_materno`, RFC, CURP, `estado_civil`, `nacionalidad`, `lugar_origen`, `fecha_nacimiento`, `domicilio`, `cp_csf`. `apellido_paterno`, `apellido_materno`, `estado_civil`, `nacionalidad`, `lugar_origen`, `fecha_nacimiento` y `domicilio` se añadieron en `20250701_contract_employee_fields.sql` (`curp` y `cp_csf` ya venían del esquema inicial), y todos **son nullable**: si el CSV no los trae, el contrato se genera con huecos.

De la oferta: `monto_prestamo_autorizado` (en número y en letra).

De la cuenta bancaria activa: se leen CLABE y banco y se pasan al generador, pero **no se imprimen en el contrato**. La plantilla no tiene placeholder para la cuenta del empleado, solo para la del acreedor: los datos bancarios del empleado hacen falta para pagarle, no para el documento que firma.

Del acreedor: las claves `acreedor_*` y `testigo_*` de `company_settings`, **todas editables desde la pantalla "Datos del acreedor"** (`/ajustes/empresa`). Dos grupos:

- **Identidad** (`acreedor_razon_social`, `acreedor_rfc`, `acreedor_representante`, `acreedor_domicilio`): tienen **valor de respaldo** en código (`ACREEDOR_DEFAULTS` en `easylex/contract-pdf.ts`, = los valores actuales de LOZAV). Si el ajuste está vacío se usa el respaldo, así que **nunca salen en blanco**.
- **Bancarios y testigos** (`acreedor_banco`, `acreedor_cuenta`, `acreedor_clabe`, `testigo_1_nombre`, `testigo_2_nombre`): **sin respaldo**. Si están vacíos, salen en blanco en el contrato. Son los cinco que faltan `(LLENAR)`.

Ver la mecánica de identidad y sus placeholders en [Plantilla del contrato](#plantilla-del-contrato-placeholders-y-arreglos).

## Plantilla del contrato: placeholders y arreglos

La plantilla de Google Docs (`TEMPLATE_DOC_ID`) se llena por completo con placeholders `{{...}}`; no quedan huecos literales (`____` o `[texto]`) que saldrían vacíos en silencio — **auditado 2026-07-31**: los únicos no-placeholder son la línea donde se firma y el nombre en el pie de firma (ver más abajo).

**Se adaptan a cada empleado/oferta** (del CSV y la oferta): `{{nombre_completo}}`, `{{estado_civil}}`, `{{nacionalidad}}`, `{{lugar_origen}}`, `{{fecha_nacimiento}}`, `{{rfc}}`, `{{domicilio}}`, `{{empleador}}`, `{{monto_numero}}`, `{{monto_letra}}`, `{{dia_firma}}`/`{{mes_firma}}`/`{{anio_firma}}`.

> **Los placeholders del monto no siempre imprimen el monto.** La plantilla repite `{{monto_numero}}` y `{{monto_letra}}`, y el generador los llena **por posición**, con valores distintos: de las cinco primeras ocurrencias de `{{monto_numero}}`, las dos primeras llevan el monto prestado y las tres siguientes el **total a pagar** (monto + 7 % de comisión + su IVA, que calcula `calculateLoanTotals` en `src/lib/contracts/loan-totals.ts`); de `{{monto_letra}}`, la primera lleva el monto en letra y la segunda el total en letra. Por eso importa el ORDEN en que aparecen en el Doc: mover, duplicar o borrar una ocurrencia cambia qué cifra imprime cada hueco sin que nada falle. Si faltan ocurrencias, `buildIndexedReplacements` **lanza** y no se genera el PDF; si sobran, se quedan sin reemplazar.

**Iguales en todos los contratos** (de `company_settings`, vía "Datos del acreedor"): `{{banco_acreedor}}`, `{{cuenta_acreedor}}`, `{{clabe_acreedor}}`, `{{testigo_1}}`, `{{testigo_2}}`, y la identidad del acreedor `{{razon_social_acreedor}}`, `{{rfc_acreedor}}`, `{{representante_acreedor}}`, `{{domicilio_acreedor}}`.

### Cambios aplicados (2026-07-31)

Dos arreglos en la plantilla, hechos por API con scripts reproducibles (dry-run + `--apply`):

1. **Formato del monto (bug corregido).** La plantilla escribía `.00` tras `{{monto_numero}}` (que ya trae decimales) y ` PESOS 00/100 MONEDA NACIONAL` tras `{{monto_letra}}` (que ya termina en `M.N.`), duplicando el formato (`$4,000.00.00 (… M.N. PESOS 00/100 MONEDA NACIONAL)`). Se quitaron ambos textos con `scripts/fix-contract-template.ts --apply`. Ahora sale `$4,000.00 (CUATRO MIL PESOS 00/100 M.N.)`.

2. **Identidad del acreedor ahora editable.** Razón social, RFC, representante y domicilio estaban **escritos fijos** en la plantilla; se convirtieron en placeholders con `scripts/add-acreedor-placeholders.ts --apply` para que "Datos de empresa" los controle. El generador usa `ACREEDOR_DEFAULTS` como respaldo, así que nunca salen en blanco.
   - **Excepción:** la razón social del **bloque de firma** sigue fija como LOZAV (está partida en dos renglones del formato de firma; convertirla rompía el diseño). Con el respaldo se ve idéntica a hoy. Si algún día cambia la razón social, hay que editar esa línea del Doc a mano. El representante del pie de firma **sí** se actualiza.

### Verificación (night-run)

`scripts/verify-contracts-batch.ts` (solo lectura) comprueba la generación y deja evidencia en `scripts/contract-verify-out/<runId>/` (report.md, results.json, PDFs; ignorado por git, conserva las últimas 25 corridas). Dos partes:

- **A) Datos:** audita los ~600 empleados y reporta cuántos generarían contrato completo vs. a cuáles les falta qué campo (sin llamar a Google). Al 2026-07-31: **3/608 listos**; el resto sin datos personales (pendiente del CSV).
- **B) Render:** genera el PDF real de los empleados listos + una batería sintética (acentos/ñ, casado/soltero, montos con centavos/grandes/chicos, apellido faltante), extrae el texto y verifica que cada campo aparezca y que no haya placeholders sin reemplazar. Veredictos: `LIMPIO`, `SOLO_BUG_CONOCIDO_PLANTILLA` (aísla el bug del monto para no confundirlo con hallazgos nuevos) o `PROBLEMAS_REALES`.

Flags: `--audit-only` (rápido, sin Google), `--synthetic-only`, `--no-synthetic`, `--render=N`, `--offset=K`. Pensado para dejarlo en loop y despertar con la bitácora.

## Cliente de EasyLex

`class EasyLexClient` en `src/lib/easylex/client.ts`.

### Autenticación

Dos cabeceras: `access-key-id` (llave pública) y `secret-access-key` (llave privada), de `Credenciales API` en el panel de EasyLex.

> **`code 106` "Public or Secret key doesn't match" — RESUELTO (2026-07-28). Era discordancia de ambiente + llave, no un problema de cuenta.**
>
> Causa raíz (confirmada por soporte de EasyLex + el dashboard):
> - La cuenta **solo existe en producción** (`api.easylex.com`), no en sandbox. Apuntar a `sandboxapi.easylex.com` nunca iba a autenticar.
> - La llave pública que estaba en `.env.local` **no era de esta cuenta**. La real se ve en el dashboard de producción (`easylex.com` → Credenciales API).
>
> Arreglo:
> - `EASYLEX_BASE_URL=https://api.easylex.com`.
> - **Resetear** la llave privada en el dashboard. Ojo: *resetear rota el par completo* — regenera pública **y** secreta. Copiar la secreta al instante (se muestra una sola vez) y pegar ambas en `.env.local`.
>
> Prueba sin gastar firma: `node scripts/test-easylex.mjs` — consulta el estado de un documento inexistente. `106` = llaves mal; `2905 "Document not found"` = autenticó OK.
>
> Los errores de la API ahora se leen claros: `describeEasyLexError` (`src/lib/easylex/client.ts`) desglosa la forma real `{ error: { message, description } }`; antes se perdía como `[object Object]`.

`POST {EASYLEX_BASE_URL}/api/public/v2/document`, como `multipart/form-data`:

| Campo | Valor |
|---|---|
| `type` | `DISI` |
| `sendEmail` | `"false"` — el envío lo hace este sistema por WhatsApp, no EasyLex por correo |
| `signatories[i][firstName\|lastName\|motherLastName\|email]` | datos del firmante |
| `files[0]` | el PDF generado |

Expiración por defecto del documento en EasyLex: **+30 días** (`getDefaultExpiration`). No confundir con el TTL de 24 horas del link, que es una regla propia de este sistema. Pendiente de confirmar con EasyLex si respeta la **hora** del `expirationDate` o lo trunca al día: con enlaces de un día la fecha casi siempre cruza la medianoche, y nuestro cliente manda dos formatos distintos (ISO completo al crear el intento, `YYYY-MM-DD` en `getDefaultExpiration`).

### Validaciones biométricas

`buildValidationConfig()` lee de `company_settings` y arma la configuración. Valor actual (verificación completa de identidad):

| Clave | Valor |
|---|---|
| `easylex_validate_id` | `true` |
| `easylex_validate_picture` | `true` |
| `easylex_validate_biometric` | `true` |
| `easylex_validate_liveness` | `true` |
| `easylex_validate_sms` | `false` |
| `easylex_validate_email` | `false` |
| `easylex_validate_voice` | `false` |

Se guardan como booleanos en texto. Se pueden cambiar en base sin redeploy.

> **Regla de dependencia (verificada en producción).** Si `validateBiometric` **o** `validateLiveness` van en `true`, EasyLex **exige** que `validateId` **y** `validatePicture` también lo estén; si no, `createDocument` falla con `502 "InvalidRequest"` (`.validateId`/`.validatePicture` allowed value `true`). Tiene sentido: para cotejar la cara necesita el documento. `buildValidationConfig` **fuerza** id+picture cuando hay biométrico/liveness, para que una configuración inconsistente en `company_settings` no tumbe el pipeline. Combinaciones válidas probadas: los 4 en `true`, o los 7 en `false`. Diagnóstico: `node scripts/probe-easylex-create.mjs DISI id,picture,biometric,liveness` (ojo: si sale `200` gasta firma).

### Consultar estado

`getDocumentStatus(documentId)` no tiene ningún job de polling detrás, pero **sí dos salidas manuales** que lo usan: "Comprobar si ya firmó" en el expediente de una persona (`syncEmployeeSignature`) y "Actualizar estados" de un ciclo (`syncBatchSignatures`). Las dos marcan la firma con la misma lógica del webhook (`mockSignContract`), así que el resultado es idéntico venga por donde venga, y las dos son idempotentes. Existen porque sin ellas una firma que el aviso automático no reflejara no tendría ninguna otra forma de llegar al expediente —y el caso suelto, alguien dado de alta a mano, no tiene lote que sincronizar—.

## Link de firma

El `signing_url` se construye a partir del id del firmante. La app expone además un redirector propio:

```
/firmar/[signerId]  →  ${EASYLEX_SIGNING_LINK_BASE_URL}/{signerId}
```

**URL correcta de producción: `EASYLEX_SIGNING_LINK_BASE_URL=https://easylex.com/documento/firma`** → el link final es `https://easylex.com/documento/firma/<signerId>`, que abre la página de firma pública (sin cuenta).

> **Cuidado con los dominios muertos.** El placeholder que muestra el propio dashboard de EasyLex (`widgetsandbox.easylex.com/firmar`) **NO existe** (NXDOMAIN): el link da "no se puede acceder al sitio". En código ya no hay ningún default que se le parezca: `EASYLEX_SIGNING_LINK_BASE_URL` sin definir vale cadena vacía y `buildSigningUrl` **lanza**, así que el intento queda en `error` con un mensaje claro en vez de generar un link muerto que el empleado no podría abrir. Tampoco sirven `widget.easylex.com/firmar/{id}` (404) ni `app.easylex.com/firmar/{id}` (redirige a login: es el panel con cuenta). El único que funciona para un firmante sin cuenta es `easylex.com/documento/firma/<signerId>`. El `signerId` es el último segmento del path (lo usa `signingUrlSuffix` para la plantilla de WhatsApp).

El redirector permite usar un dominio propio en las plantillas de WhatsApp, lo cual importa porque Meta solo admite variables en la ruta de un botón URL, no en el dominio.

### Plantilla de WhatsApp del link (botón URL dinámico)

En la plantilla `adelanto_contrato_listo` (Meta → WhatsApp Manager), el botón es *dinámico*: la **base va fija** y Meta le pega `{{1}}`. Deben coincidir con `EASYLEX_SIGNING_LINK_BASE_URL`:

- **URL del sitio web:** `https://easylex.com/documento/firma/` (con `/` final; Meta añade `{{1}}`).
- **URL de muestra `{{1}}`:** `https://easylex.com/documento/firma/sig-XXXX`.

La app manda el `signerId` de cada empleado como `{{1}}`, así que cada quien recibe su propio link.

### Envío del link al empleado

Cuando el contrato queda listo, `requestContractFromWhatsApp` envía el link al empleado por WhatsApp (`src/lib/contracts/send-contract-link.ts`), como plantilla con **botón URL**: el link va en el botón; el cuerpo lleva tres variables — `{{1}}` nombre, `{{2}}` monto, `{{3}}` fecha límite. La plantilla se configura con `WHATSAPP_CONTRACT_TEMPLATE` (por defecto `adelanto_contrato_listo`, categoría UTILITY) y debe estar aprobada en Meta con ese botón dinámico.

El envío es **no-fatal**: si falla (WhatsApp mal configurado, plantilla no aprobada, número inválido), el contrato ya está generado y el link sigue en la respuesta (`link_easylex`). El resultado incluye `link_enviado: boolean` y el intento queda registrado en `whatsapp_contract_messages` con `message_type = 'contract_link'`.

> Antes, el endpoint solo **devolvía** el link y se asumía que un sistema externo (ManyChat, retirado) lo reenviaba. Ese hueco lo cerraba nadie; ahora lo envía la propia app.

## Webhook de firma

`POST /api/webhooks/easylex/sign`. Detalle completo en [API](api.md#webhooks). Lo esencial:

- Se autentica por la cabecera `x-easylex-signature`. `verifyEasylexWebhook` acepta **cualquiera de dos esquemas** (verificado E2E): secreto compartido plano **o** HMAC-SHA256 del cuerpo crudo (con prefijo `sha256=` opcional). No está confirmado cuál usa EasyLex, así que se admiten ambos —los dos exigen el secreto, no debilita nada—. Por eso el handler lee `request.text()` (cuerpo crudo) y parsea después: un JSON reserializado invalidaría el HMAC.
- **En producción, sin secreto configurado se rechaza todo** con `401` (fail closed). Fuera de producción se permite (fail-open) con log, para pruebas.
- `DOCUMENT_SIGNED` es el evento que cierra el ciclo (busca por `data.id`); `SIGNED_BY_USER` solo deja registro (busca por `data.documentId`).
- Marca `contract_attempts` → `firmado` siempre, pero **qué pasa con la solicitud depende de si sigue en curso** (`queHacerConLaFirma`, `src/lib/contracts/firma-tardia.ts`). Solo desde `recibida`, `generando` o `link_generado` se marcan `contract_requests` → `firmado` y `advance_offers` → `firmada`, con el `audit_events` `contract.signed` (la **evidencia legal** de la firma). Desde cualquier otro estado —`reemplazada`, típicamente, porque entró un ciclo nuevo— la firma **se guarda como evidencia pero NO revive la solicitud**: se archiva el PDF sin avisarle a la persona (`soloArchivar`), se registra el `audit_events` `contract.signed_fuera_de_curso` y se deja un `logger.error` para que operación lo resuelva. Revivirla metería un pago con el monto de un ciclo ya cerrado en el Excel de dispersión, y encima invisible: el tablero solo arma filas sobre la oferta vigente. La lista de estados es blanca a propósito: uno nuevo que nadie previó cae del lado que no mueve dinero.
- Idempotencia por `easylex_events.event_id`, con la salvedad de que si falta `webhookId` el id se sintetiza con `Date.now()` y por tanto nunca colisiona.
- **Ante un error de procesamiento devuelve `500`** (no `200`) para que EasyLex **reintente**; los manejadores son idempotentes, así que un fallo transitorio de BD no pierde la firma. (Antes respondía `200` y la firma se perdía en silencio.)

Prueba E2E sin gastar firma: `node scripts/demo-webhook-sign.mjs` — crea un contrato mock, dispara `DOCUMENT_SIGNED` al handler real (con firma HMAC si `EASYLEX_WEBHOOK_SECRET` está en `.env.local`), verifica la propagación y limpia.

`EASYLEX_CALLBACK_URL` debe terminar en `/api/webhooks/easylex/sign` — es lo que la app manda a EasyLex por documento para que llame de vuelta. Debe ser una **URL pública** (EasyLex no alcanza `localhost`).

## Entrega del contrato firmado al empleado

Tras confirmar la firma, `handleDocumentSigned` llama a `deliverSignedContract` (`src/lib/contracts/deliver-signed-contract.ts`):

1. **Descarga** el PDF firmado de EasyLex (`EasyLexClient.getSignedDocument` → `GET /document/signed/{id}`).
2. **Archiva** en el bucket privado `contratos-firmados` (`{contractRequestId}/{documentId}.pdf`) y guarda la ruta en `contract_attempts.signed_pdf_path`.
3. **Envía** el PDF al empleado por WhatsApp (`WhatsAppClient.sendDocument`, con una signed URL temporal).

Es **best-effort y NUNCA lanza**: un fallo aquí no debe convertir el webhook en 5xx (la firma ya quedó registrada). El **archivo se intenta siempre**; el envío es lo frágil.

> **Restricción de WhatsApp (24 h).** Meta solo entrega un documento iniciado por el negocio dentro de la **ventana de 24 h** desde el último mensaje del empleado. Como acaban de firmar, normalmente están dentro. Si pasaron >24 h, Meta lo rechaza — el PDF **igual queda archivado** y el operador puede reenviarlo. Deja constancia con el `audit_event` `contract.signed_delivered` (`metadata.sent`).

### Desde el backoffice (expediente firmado)

| Acción | Ruta | Qué hace |
|---|---|---|
| Descargar contrato firmado | `GET /api/backoffice/contracts/[contractRequestId]/signed-pdf` | Redirige a una signed URL de descarga del PDF archivado. Rol `operaciones`. `404` si aún no hay archivo |
| Reenviar al empleado | `resendSignedContractAction` (server action) | Re-corre `deliverSignedContract` (re-archiva + reintenta el WhatsApp). Útil si la entrega automática falló |

Ambas viven en `AccionesExpediente` (`src/app/(operacion)/personas/_ui/acciones-expediente.tsx`) y **no se ocultan cuando no aplican**: se ven apagadas y dicen por qué ("El PDF existe cuando la persona ya firmó", "Solo se puede reenviar cuando el contrato ya está firmado"). La regla del bloque es que nada desaparezca: un botón que no está hace dudar de si la función existe.

## Firma simulada

`POST /api/webhooks/easylex/mock-sign` marca un contrato como firmado sin pasar por EasyLex, para pruebas.

**Deshabilitado por defecto en todas partes**, con doble cerrojo: hay que activarlo explícitamente con `ENABLE_MOCK_SIGN="true"` **y** no estar en producción. Si falta cualquiera de las dos condiciones responde `404` —no `403`, para no delatar que existe—. Los dos candados son a propósito: con uno solo, un despliegue con `NODE_ENV` mal fijado reabriría un endpoint que no tiene autenticación ninguna. Sigue siendo una herramienta de desarrollo, no un mecanismo operativo.

## Acciones desde el backoffice

En el expediente de una persona (`/personas/[empleadoId]`):

| Acción | Endpoint | Resultado |
|---|---|---|
| Regenerar link | `POST /api/backoffice/contracts/[id]/regenerate-link` | `link_regenerated` si expiró, `link_reused` si sigue vigente |
| Reintentar flujo | `POST /api/backoffice/contracts/[id]/retry` | limpia el error y reintenta la generación |

Ambas devuelven `already_signed` si el contrato ya está firmado — no se puede deshacer una firma desde la UI, por diseño.

## Mapeo de estados

| EasyLex | Interno (`contract_attempt_status`) |
|---|---|
| documento creado | `generado` |
| firmado | `firmado` |
| link vencido | `expirado` |
| error de la API | `error` |

Estados de la solicitud (`contract_request_status`): `recibida` → `generando` → `link_generado` → `firmado`, con `error` como salida lateral y `reemplazada` como cierre cuando entra un ciclo nuevo (`supersedePreviousContract` en `src/lib/imports/apply.ts`, que además adelanta el `expires_at` de los intentos vivos: el reloj es la única revocación que hay). `reemplazada` se añadió en `20260901_contract_request_reemplazada_status.sql` y es el estado por el que una firma tardía se guarda como evidencia sin revivir el pago.

## Ambiente y configuración de producción

El default en código de `EASYLEX_BASE_URL` **apunta al sandbox** (`https://sandboxapi.easylex.com`) — es el footgun más fácil de pasar por alto al desplegar, porque la cuenta real solo existe en producción y contra el sandbox nada autentica (`code 106`). `EASYLEX_SIGNING_LINK_BASE_URL` ya no tiene default: sin ella no se construye ningún link, se lanza. Hay que fijar explícitamente:

```
EASYLEX_BASE_URL=https://api.easylex.com
EASYLEX_SIGNING_LINK_BASE_URL=https://easylex.com/documento/firma
EASYLEX_ACCESS_KEY_ID=<pública del dashboard de producción>
EASYLEX_SECRET_ACCESS_KEY=<secreta; sale al resetear en el dashboard>
EASYLEX_CALLBACK_URL=https://<dominio-público>/api/webhooks/easylex/sign
EASYLEX_WEBHOOK_SECRET=<mismo secreto que se configure en EasyLex>
```

`EASYLEX_ACCESS_KEY_ID` **no** debe traer `_` inválidos ni espacios. La secreta **nunca** se pega en correos ni logs; la pública sí se puede compartir.

### Scripts de diagnóstico (`scripts/*.mjs`)

Corren con `node` (leen `.env.local`, no imprimen secretos): `test-easylex.mjs` (smoke de credenciales), `probe-easylex-create.mjs` (diagnostica campos rechazados), `probe-easylex-widget.mjs` (datos del signer), `dump-easylex-settings.mjs` (validaciones en `company_settings`), `inspect-employee.mjs` (estado de contrato de un empleado), `demo-webhook-sign.mjs` (prueba E2E del webhook).

Ver también: [API](api.md) · [Base de datos](base-de-datos.md) · [Configuración](configuracion.md)
