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
contract_attempts          attempt_number 1, 2, 3…  TTL 2 h
      │
      │  el empleado firma en EasyLex
      ▼
POST /api/webhooks/easylex/sign   (DOCUMENT_SIGNED)
      │
      ▼
attempt → firmado · request → firmado · offer → firmada
```

## Reglas de negocio

Implementadas en `requestContractFromWhatsApp()` (`src/lib/contracts/request-contract.ts`):

1. **Identidad por RFC.** Se busca el empleado por RFC, nunca por teléfono. Si no existe → `not_found`.
2. **Oferta vigente y elegible.** Sin oferta `is_current` → `no_offer`. Con oferta no elegible → `not_eligible`.
3. **Cuenta bancaria activa obligatoria.** Sin CLABE activa el contrato no se genera.
4. **Una solicitud por oferta.** Garantizado por `UNIQUE (offer_id)` y por el índice parcial que impide más de una solicitud activa por empleado.
5. **Si ya firmó** → `already_signed`, sin generar nada nuevo.
6. **Si hay un link vigente, se reutiliza.** No se crea un intento nuevo mientras el anterior no expire.
7. **Si el link expiró, se regenera como nuevo intento** dentro de la misma solicitud.
8. **Snapshot congelado.** Al crear la solicitud se guarda `contract_snapshot` con nombre, apellidos, RFC, CURP, CLABE, banco, monto, empleador, teléfono, email y procedencia. Una reimportación posterior no altera lo firmado.

`LINK_TTL_HOURS = 2`, definido en tres archivos (`request-contract.ts`, `backoffice-actions.ts`, `create-easylex-attempt.ts`). Cambiar el TTL exige tocar los tres.

## Generación del PDF

> **Requisito de despliegue crítico.** La generación de contratos **depende de Google Docs**, y sus credenciales son **archivos**, no variables de entorno: `src/lib/google/auth.ts` lee `google_oauth_client.json` y `token.json` desde `process.cwd()`. Sin esos dos archivos, cada intento de generar un contrato falla con `ENOENT` y la API devuelve `400`. En un contenedor de Cloud Run no existen salvo que se monten explícitamente.

El nombre despista: `generateContractPdf` vive en `src/lib/easylex/contract-pdf.ts` y parece la ruta de `pdf-lib`, pero **delega en Google Docs**:

```
create-easylex-attempt.ts
  └─ generateContractPdf            (easylex/contract-pdf.ts)
       └─ generateContractPdfFromGoogleDocs   (google/contract-pdf.ts)  ← usa Google
```

`easylex/contract-pdf.ts` solo prepara los datos —incluido el monto en letra— y delega. El `TEMPLATE_DOC_ID` del documento de Google está hardcodeado.

La plantilla PDF con AcroForm (`src/lib/easylex/templates/contrato-prestamo.pdf`) y los scripts que la generaron (`create-pdf-template-fixed.ts`, `inspect-pdf.ts`, `extract-pdf-text.ts`) corresponden a un enfoque anterior con `pdf-lib` que **ya no está conectado a nada**. Se conservan pero no participan en el flujo.

El monto se escribe también en letra mediante `montoEnLetra()` (`src/lib/easylex/monto-en-letra.ts`), sobre `@komandero/numeros-a-letras`.

## Datos que necesita el contrato

Del empleado (`employees`): nombre, `apellido_paterno`, `apellido_materno`, RFC, CURP, `estado_civil`, `nacionalidad`, `lugar_origen`, `fecha_nacimiento`, `domicilio`, `cp_csf`. Los siete últimos se añadieron en `20250701_contract_employee_fields.sql` y **son nullable**: si el CSV no los trae, el contrato se genera con huecos.

De la oferta: `monto_prestamo_autorizado` (en número y en letra).

De la cuenta bancaria: CLABE y banco.

Del acreedor: las claves `acreedor_*` de `company_settings`. Cuatro vienen sembradas; `acreedor_banco`, `acreedor_cuenta`, `acreedor_clabe`, `testigo_1_nombre` y `testigo_2_nombre` están **vacías y marcadas `(LLENAR)`**. Un contrato emitido sin llenarlas sale incompleto.

## Cliente de EasyLex

`class EasyLexClient` en `src/lib/easylex/client.ts`.

### Crear documento

`POST {EASYLEX_BASE_URL}/api/public/v2/document`, como `multipart/form-data`:

| Campo | Valor |
|---|---|
| `type` | `DISI` |
| `sendEmail` | `"false"` — el envío lo hace este sistema por WhatsApp, no EasyLex por correo |
| `signatories[i][firstName\|lastName\|motherLastName\|email]` | datos del firmante |
| `files[0]` | el PDF generado |

Expiración por defecto del documento en EasyLex: **+30 días** (`getDefaultExpiration`). No confundir con el TTL de 2 horas del link, que es una regla propia de este sistema.

### Validaciones biométricas

`buildValidationConfig()` lee de `company_settings` y arma la configuración:

| Clave | Valor sembrado |
|---|---|
| `easylex_validate_biometric` | `true` |
| `easylex_validate_liveness` | `true` |
| `easylex_validate_id` | `false` |
| `easylex_validate_sms` | `false` |
| `easylex_validate_picture` | `false` |
| `easylex_validate_email` | `false` |
| `easylex_validate_voice` | `false` |

Se guardan como booleanos en texto. Se pueden cambiar en base sin redeploy.

### Consultar estado

`getDocumentStatus(documentId)` existe y está disponible, pero **no hay job de polling**: la confirmación de firma depende hoy exclusivamente del webhook.

## Link de firma

El `signing_url` se construye a partir del id del firmante. La app expone además un redirector propio:

```
/firmar/[signerId]  →  ${EASYLEX_SIGNING_LINK_BASE_URL}/{signerId}
```

Por defecto `https://widgetsandbox.easylex.com/firmar` — **sandbox**. En producción hay que definir `EASYLEX_SIGNING_LINK_BASE_URL`.

El redirector permite usar un dominio propio en las plantillas de WhatsApp, lo cual importa porque Meta solo admite variables en la ruta de un botón URL, no en el dominio.

### Envío del link al empleado

Cuando el contrato queda listo, `requestContractFromWhatsApp` envía el link al empleado por WhatsApp (`src/lib/contracts/send-contract-link.ts`), como plantilla con **botón URL**: el link va en el botón, el cuerpo lleva nombre y monto. La plantilla se configura con `WHATSAPP_CONTRACT_TEMPLATE` (por defecto `contrato_listo`) y debe estar aprobada en Meta con ese botón.

El envío es **no-fatal**: si falla (WhatsApp mal configurado, plantilla no aprobada, número inválido), el contrato ya está generado y el link sigue en la respuesta (`link_easylex`). El resultado incluye `link_enviado: boolean` y el intento queda registrado en `whatsapp_contract_messages` con `message_type = 'contract_link'`.

> Antes, el endpoint solo **devolvía** el link y se asumía que un sistema externo (ManyChat, retirado) lo reenviaba. Ese hueco lo cerraba nadie; ahora lo envía la propia app.

## Webhook de firma

`POST /api/webhooks/easylex/sign`. Detalle completo en [API](api.md#webhooks). Lo esencial:

- Se autentica por la cabecera `x-easylex-signature`, comparada en tiempo constante contra `EASYLEX_WEBHOOK_SECRET`. **En producción, sin secreto configurado se rechaza todo** (fail closed).
- `DOCUMENT_SIGNED` es el evento que cierra el ciclo; `SIGNED_BY_USER` solo deja registro.
- Idempotencia por `easylex_events.event_id`, con la salvedad de que si falta `webhookId` el id se sintetiza con `Date.now()` y por tanto nunca colisiona.
- **Siempre responde `200`**, incluso ante error, para evitar reintentos de EasyLex.

`EASYLEX_CALLBACK_URL` debe terminar en `/api/webhooks/easylex/sign` — está anotado en `.env.example` y fue motivo de un fix previo.

## Firma simulada

`POST /api/webhooks/easylex/mock-sign` marca un contrato como firmado sin pasar por EasyLex, para pruebas.

**Deshabilitado en producción**: responde `404`. Fuera de producción no tiene autenticación, así que sigue siendo una herramienta de desarrollo, no un mecanismo operativo.

## Acciones desde el backoffice

En el detalle de un empleado (`/contracts/[employeeId]`):

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

Estados de la solicitud (`contract_request_status`): `recibida` → `generando` → `link_generado` → `firmado`, con `error` como salida lateral.

## Ambiente por defecto

`EASYLEX_BASE_URL` tiene por defecto `https://sandboxapi.easylex.com` y el link de firma apunta a `widgetsandbox.easylex.com`. **El sistema funciona contra sandbox mientras no se cambien ambas variables.** Es el detalle más fácil de pasar por alto al desplegar.

Ver también: [API](api.md) · [Base de datos](base-de-datos.md) · [Configuración](configuracion.md)
