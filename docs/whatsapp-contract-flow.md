# Flujo de contrato por WhatsApp + EasyLex

## Propósito

Documentar el flujo completo de generación y firma de contratos mediante WhatsApp Cloud API y EasyLex, incluyendo la separación entre el **mensaje de invitación** y el **mensaje con el link de firma**.

---

## Problema actual

El flujo actual envía un único mensaje masivo con un botón de URL que apunta directamente a la generación del contrato. Esto genera dos problemas:

1. **Experiencia confusa**: el usuario hace clic en un botón que parece llevarlo al contrato, pero en realidad dispara una API que genera el documento y devuelve el link.
2. **No hay confirmación de envío**: si el usuario hace clic en "Solicitar", no recibe un segundo mensaje de WhatsApp confirmando que su contrato está listo y con el link para firmar.

El flujo correcto separa claramente ambos momentos:

- **Mensaje 1**: invitación con botón de solicitud.
- **Mensaje 2**: entrega del contrato listo para firmar.

---

## Flujo correcto

```
┌─────────────────────────────────────────────────────────────┐
│  Mensaje 1: Invitación (envío masivo)                         │
│  "Hola {{nombre}}, tenés ${{monto}} disponibles.              │
│   ¿Querés solicitar tu adelanto de nómina?"                  │
│                                                              │
│  [Solicitar] ───────► POST /api/whatsapp/request-contract    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
               ┌──────────────────────────────┐
               │  Backend:                     │
               │  1. Valida RFC y oferta       │
               │  2. Genera PDF del contrato     │
               │  3. Crea documento en EasyLex │
               │  4. Obtiene signing_url       │
               └──────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Mensaje 2: Contrato listo (respuesta individual)             │
│  "Hola {{nombre}}, tu contrato por ${{monto}} está listo.     │
│   Tocá el botón para firmarlo."                               │
│                                                              │
│  [Firmar contrato] ──► https://widget.easylex.com/firmar/... │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
               ┌──────────────────────────────┐
               │  Usuario firma en EasyLex     │
               └──────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Webhook: POST /api/webhooks/easylex/sign                   │
│  1. Actualiza contract_attempts → firmado                     │
│  2. Actualiza contract_requests → firmado                    │
│  3. Actualiza advance_offers → firmada                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Templates necesarios en Meta Business

### Template 1: `adelanto_nomina_v2` (invitación)

**Propósito**: envío masivo para invitar al empleado a solicitar su adelanto.

**Canal**: WhatsApp.

**Tipo**: `MARKETING` o `UTILITY` según lo apruebe Meta.

**Cuerpo (body)**:
```
Hola {{1}}, tenés un adelanto de nómina disponible por {{2}}.
¿Querés solicitarlo? Tocá el botón para continuar.
```

**Variables**:
| Posición | Nombre | Ejemplo |
|----------|--------|---------|
| {{1}} | nombre | Juan |
| {{2}} | monto | $5,000.00 |

**Botón**:
- Tipo: `URL` o `QUICK_REPLY`
- Texto: `Solicitar`
- URL (si es URL): `https://tudominio.com/api/whatsapp/request-contract?rfc={{rfc}}&subscriber_id={{subscriber_id}}`

> **Nota**: Meta no permite pasar parámetros dinámicos complejos en el botón de URL. Si es necesario enviar `rfc` y `subscriber_id`, se puede usar una página intermedia (`/solicitar`) que lea los parámetros de query y haga el POST a la API. Otra opción es que el botón sea `QUICK_REPLY` y el backend responda al mensaje entrante.

### Template 2: `adelanto_contrato_listo` (entrega del contrato)

**Propósito**: enviar el link de firma al usuario que ya generó su contrato.

**Canal**: WhatsApp.

**Tipo**: `UTILITY`.

**Cuerpo (body)**:
```
Hola {{1}}, tu contrato por {{2}} está listo para firmar.
Tenés hasta {{3}} para hacerlo. Tocá el botón para continuar.
```

**Variables**:
| Posición | Nombre | Ejemplo |
|----------|--------|---------|
| {{1}} | nombre | Juan |
| {{2}} | monto | $5,000.00 |
| {{3}} | expiración | 1 de julio de 2025, 18:00 |

**Botón URL**:
- Tipo: `URL`
- Texto: `Firmar contrato`
- URL: `{{3}}` o `{{4}}` (según configuración del template)

> **Importante**: Meta permite variables de texto en el botón URL solo en la ruta, no en el dominio. Si el dominio de EasyLex varía, se recomienda usar un dominio propio como intermediario (`https://tudominio.com/firmar/{token}`) que redirija al `signing_url` de EasyLex.

---

## Configuración del backend

### Variables de entorno

```env
# WhatsApp
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=

# EasyLex
EASYLEX_ACCESS_KEY_ID=
EASYLEX_SECRET_ACCESS_KEY=
EASYLEX_BASE_URL=https://sandboxapi.easylex.com
EASYLEX_CALLBACK_URL=https://tudominio.com/api/webhooks/easylex/sign

# Template de contrato listo
WHATSAPP_CONTRACT_TEMPLATE_NAME=adelanto_contrato_listo
```

### Configuración en `company_settings`

| Key | Valor por defecto | Descripción |
|-----|-------------------|-------------|
| `whatsapp_contract_template_name` | `adelanto_contrato_listo` | Nombre del template que envía el link de firma |
| `whatsapp_contract_button_text` | `Firmar contrato` | Texto del botón del template |
| `easylex_validate_biometric` | `true` | Activar validación biométrica en EasyLex |
| `easylex_validate_liveness` | `true` | Activar prueba de vida en EasyLex |

---

## Cambios necesarios en el código

### 1. Nuevo helper: `src/lib/whatsapp/contract-messages.ts`

Responsabilidad: enviar el segundo mensaje de WhatsApp con el link de firma.

Funciones esperadas:

```ts
export async function sendContractLinkMessage(params: {
  to: string;
  templateName: string;
  nombre: string;
  monto: string;
  expirationDate: string;
  signingUrl: string;
}): Promise<SendTemplateResult>;
```

Debe:
- Usar `WhatsAppClient.sendTemplateWithButton()` o `sendTemplateMessage()`.
- Registrar el envío en `whatsapp_contract_messages` con `message_type: "contract_link"`.
- Manejar errores sin interrumpir el flujo principal (el link ya se generó; si el mensaje no se envía, queda en logs).

### 2. Modificar `requestContractFromWhatsApp`

En `src/lib/contracts/request-contract.ts`, después de generar el `attempt` y antes de devolver la respuesta, agregar:

```ts
await sendContractLinkMessage({
  to: employee.telefono_normalizado,
  templateName: companySettings.whatsapp_contract_template_name ?? "adelanto_contrato_listo",
  nombre: employee.nombre,
  monto: formatMonto(offer.monto_prestamo_autorizado),
  expirationDate: formatDateForDisplay(attempt.expires_at),
  signingUrl: attempt.signing_url,
});
```

### 3. Modificar el flujo de envío masivo

El mensaje masivo actual (`adelanto_nomina_v2`) debe dejar de apuntar directamente al contrato. El botón debe apuntar a `/api/whatsapp/request-contract` o a una página intermedia que dispare la solicitud.

Opciones para el botón del primer mensaje:

#### Opción A: URL directa a la API

```
https://tudominio.com/api/whatsapp/request-contract?rfc=ABC010101ABC&subscriber_id=123
```

Problema: la API requiere POST, no GET. El botón de URL de Meta siempre hace GET.

#### Opción B: Página intermedia (`/solicitar`)

Crear `src/app/solicitar/page.tsx` que:
- Lea `rfc` y `subscriber_id` de la query string.
- Haga `POST /api/whatsapp/request-contract` con esos datos.
- Muestre un mensaje de "Tu contrato está llegando por WhatsApp" o redirija al link si ya se generó.

#### Opción C: Botón de respuesta rápida (quick reply)

El botón del template envía un mensaje de texto predefinido como respuesta. El webhook de WhatsApp lo recibe y dispara la generación del contrato.

Ventaja: no requiere página intermedia.
Desventaja: requiere que el usuario ya tenga conversación abierta y que el webhook de WhatsApp procese el mensaje entrante.

### 4. Actualizar la tabla `whatsapp_contract_messages`

El helper debe insertar:

```ts
{
  employee_id: employee.id,
  offer_id: offer.id,
  contract_request_id: contractRequest.id,
  message_type: "contract_link",
  status: "sent",
  delivery_status: "sent",
  wa_message_id: result.messageId,
  whatsapp_subscriber_id: input.subscriberId,
  metadata: {
    template_name: templateName,
    signing_url: signingUrl,
    expires_at: attempt.expires_at,
  }
}
```

---

## Consideraciones de diseño

### Seguridad

- El link de EasyLex (`signing_url`) es de un solo uso y tiene expiración de 2 horas.
- No compartir el link en respuestas de API pública; solo enviarlo por WhatsApp.
- Si se usa página intermedia, validar que el `rfc` y `subscriber_id` coincidan con un empleado activo.

### Costos

- Cada envío de template de WhatsApp tiene costo en Meta.
- Cada documento creado en EasyLex consume una firma del plan.
- El segundo mensaje solo se envía cuando el contrato se genera correctamente, por lo que no hay envíos innecesarios.

### UX

- El mensaje de invitación debe ser claro: "Solicitar" no "Firmar".
- El segundo mensaje debe indicar la expiración del link.
- Si el usuario ya firmó, no enviar el segundo mensaje; devolver `already_signed`.

### Meta Business

- El template `adelanto_contrato_listo` debe ser aprobado antes de usarlo en producción.
- Para aprobación, proveer ejemplos reales de variables y URL.
- Si el botón URL usa un dominio propio, ese dominio debe estar verificado en Meta.

---

## Próximos pasos para implementar

1. Crear el template `adelanto_contrato_listo` en Meta Business y obtener aprobación.
2. Crear el helper `sendContractLinkMessage` en `src/lib/whatsapp/contract-messages.ts`.
3. Modificar `requestContractFromWhatsApp` para llamar al helper después de generar el link.
4. Decidir la estrategia del botón del primer mensaje (página intermedia, quick reply o API directa).
5. Agregar las nuevas keys a `company_settings`.
6. Actualizar `.env.example` con `WHATSAPP_CONTRACT_TEMPLATE_NAME`.
7. Probar el flujo completo en sandbox.

---

## Referencias

- `src/app/api/whatsapp/request-contract/route.ts`
- `src/lib/contracts/request-contract.ts`
- `src/lib/contracts/create-easylex-attempt.ts`
- `src/lib/easylex/client.ts`
- `src/lib/whatsapp/client.ts`
- `src/app/api/webhooks/easylex/sign/route.ts`
