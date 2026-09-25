# WhatsApp Chatbot — Oferta de adelanto (plan maestro)

> Estado: **construido y en producción**. Este documento nació como el mapa del
> cambio —reemplazar el botón-URL de la oferta por un flujo **conversacional**
> (botones de respuesta rápida Sí/No) manejado por webhook + código— y se
> conserva porque sigue siendo el único sitio donde están escritas las razones de
> cada rama. El flujo vive en `src/lib/whatsapp/chatbot.ts`. Los checklists de §7
> y §8 son del plan original y no dicen lo que falta hoy; lo que sigue pendiente
> de verdad está marcado en §3 y §10.

## 1. Objetivo y por qué

Hoy el mensaje de oferta usa un **botón de URL** cuya base vive en la plantilla
de Meta. Eso es frágil (la base se desalinea con el código y el link se rompe) y
obliga a re-aprobar la plantilla ante cualquier cambio de dominio.

El nuevo diseño lo vuelve un **chatbot**:

- La oferta llega con **dos botones de respuesta rápida**: `Sí, lo quiero` / `No, gracias`.
- Al tocar un botón, Meta manda un **webhook** → **nuestro código** decide el resto.
- Se respeta la **decisión #2** (generar contrato **solo con interés**): el
  contrato se crea únicamente al tocar "Sí" → cero firmas gastadas de más.
- El link de firma se manda como **mensaje de sesión libre** (ventana de 24 h) →
  ya **no depende** de la base de URL de la plantilla. Adiós al bug.
- Ganamos el **"No"** explícito (dato de quién declinó).

## 2. Flujo de la conversación

```
                    OFERTA (plantilla, único mensaje que pasa por Meta)
                    [ Sí, lo quiero ]   [ No, gracias ]
                          │                    │
        ┌─────────────────┘                    └──────────────┐
        ▼                                                      ▼
   toca "SÍ"                                              toca "NO"
        │                                                      │
        ├─ ¿fuera de la ventana? ► "El plazo cerró ⏳" (§2.1)  │
        ├─ ¿ya firmó? ───────────► "Ya firmaste ✅"            │
        ├─ ¿link vivo (<24h)? ───► reenvía el MISMO link       │
        ├─ ¿link expiró (>24h)? ─► uno NUEVO si hay ventana    │
        ├─ ¿sin oferta/no elegible? ─► "No tienes adelanto…"   │
        ├─ ¿falla EasyLex? ──────► "Hubo un problema…"         │
        └─ normal ──► genera contrato ──► manda link           └─► oferta = rechazada
                     "⏳ Vence el <fecha y hora>: <link>"           "Gracias por confirmar 👍"
```

### Mensajes (finales)

**Rama "Sí, lo quiero"** cuando se genera el contrato:
```
✅ ¡Listo, [Nombre]! Generamos tu contrato de adelanto por [Monto].

[link de firma]

⏳ El enlace vence el [fecha y hora]. Fírmalo con tu identificación (INE) desde tu celular.
```

**Rama "Sí, lo quiero"** cuando solo se le devuelve el enlace que ya tenía:
```
Aquí está de nuevo tu enlace, [Nombre], el mismo de antes por [Monto]. Sigue sirviendo.

[link de firma]

⏳ El enlace vence el [fecha y hora]. Fírmalo con tu identificación (INE) desde tu celular.
```

Son dos textos y no uno porque con un enlace de un día el reenvío pasó a ser la rama habitual, y decirle "Generamos tu contrato" cada vez le haría creer que se le están generando varios. La fecha es la real del intento (`expires_at`), no el plazo nominal: si el enlace se reusó, le queda menos. Cuál de los dos sale lo decide si el resultado vino reusado, no la puerta por la que entró.

**Rama "No, gracias":**
```
👍 Gracias por confirmar, [Nombre]. No haremos el adelanto este periodo.
```

### Edge cases (v1 — imprescindibles)

| Caso | Riesgo si no se maneja | Manejo |
|---|---|---|
| Doble tap en "Sí" (link vivo) | Genera 2 contratos → **gasta 2 firmas** | Reusa el link vivo (índice *una-activa-por-empleado* + `getReusableAttempt`) y avisa que es un reenvío, no un contrato nuevo |
| Toca "Sí" con el enlace vencido | Link muerto | Dentro de la ventana genera uno nuevo; fuera no genera nada y se le dice qué pasó DE VERDAD con su solicitud (`solicitudPrevia`): enlace vencido, contrato que no se pudo preparar, o solicitud en proceso. Nunca se le promete un enlace que no existe |
| Ya firmó | Contrato de más | "Ya firmaste ✅" |
| Contesta a la oferta del ciclo ANTERIOR | Contrato por un monto que nunca vio | Si la respuesta es anterior a la oferta vigente (`respuestaEsDeOtraOferta`), no se genera nada y se le dice que busque el mensaje más reciente. Aplica también al "No", que si no rechazaría la oferta nueva |
| Mensaje que Meta entrega con retraso | Un "Sí" válido tirado en silencio, o una guía de madrugada | Dos cortes: `MAX_ANTIGUEDAD_RESPUESTA_MS` (= la ventana) para el Sí/No, `MAX_ANTIGUEDAD_MS` (30 min) para todo lo demás |
| No elegible / sin oferta | Algo inválido | "No tienes adelanto disponible…" |
| EasyLex caído | El empleado queda sin respuesta | "Hubo un problema, intenta más tarde" |
| Escribe texto (no botón) | El bot parece muerto | Acepta SÍ/NO escritos (lista cerrada); cualquier otra cosa recibe la guía y queda visible en el expediente |
| Manda nota de voz, foto, sticker, ubicación o documento | Se ignoraba en silencio y la persona quedaba esperando una respuesta que nunca llegaba | Recibe `UNSUPPORTED_MESSAGE`: "por aquí solo puedo leer texto", con la instrucción de escribir SÍ o NO |
| No → luego Sí (cambia de opinión) | Queda bloqueado como rechazada | **No se reactiva** (sigue en v2, §11): una oferta `rechazada` sale por `not_eligible` y la persona oye "no tienes un adelanto disponible". Tampoco se le puede reenviar la oferta del ciclo actual, porque `rechazada` no es elegible para envío; la vuelta es el **ciclo nuevo**, que le crea una oferta fresca `vigente` |
| Teléfono no está en la BD | Error en el webhook | "No encontramos tu número… contacta a tu empresa" |

### 2.1 Ventana para pedir

Regla del cliente: el adelanto **no** se puede pedir en cualquier momento. Lo abre
la empresa al mandar la oferta y dura un día (24 h desde el envío).
Vive en `src/lib/contracts/ventana-oferta.ts` y la usan **las dos puertas**: el
"Sí" del chatbot y el enlace `/solicitar`.

| Pregunta | Decisión | Por qué |
|---|---|---|
| ¿Qué abre la ventana? | **Solo** un `bulk_contract_offer` (envío desde /ofertas) que Meta **aceptó** (`wa_message_id` y `delivery_status` sent/delivered/read) | Las filas de envío se crean antes de llamar a Meta y sobreviven al fracaso. El `contract_link` lo manda la propia solicitud en cada clic de /solicitar: si contara, cada solicitud se abriría otra ventana y se podrían pedir contratos sin fin |
| ¿Desde cuándo corre? | Desde que el mensaje **llegó** al teléfono (`delivered_at`); si Meta no avisó, desde que salió. Se compara con la hora en que la persona **contestó** (marca de Meta), no con la de procesarlo | Quien trae el celular sin señal recibe la oferta horas después; y un reintento de Meta no debe dejar fuera a quien pidió a tiempo |
| ¿Hasta cuándo se respeta una entrega tardía? | **24 h** desde el envío (`TOPE_ENTREGA_TARDIA_MS`) | Meta reintenta hasta 30 días; un teléfono que reaparece días después no reabre la oferta |
| ¿Se ancla a la fecha de la oferta? | **No** | Reimportar la nómina (p. ej. para corregir una CLABE) crea ofertas nuevas para todos y dejaría fuera de plazo a quien ya recibió el mensaje |
| ¿Duplicados? | Se juzga **solo sobre la fila de la persona** | El RFC es único en `employees`; juntar por teléfono mezclaría a personas distintas que comparten celular |
| ¿Si la base falla? | **Cerrada** | Negar de más se arregla reenviando la oferta; un contrato que nadie ofreció no se deshace |
| ¿Quién ya pidió? | `solicitada` fuera de plazo no genera otro contrato. Si tiene un enlace **vigente** (el suyo, o uno que le regeneró un operador) se le entrega reusándolo; si no, se le dice lo cierto: venció, no se pudo preparar, o sigue en proceso. `firmada` solo recibe la confirmación | Quien alcanzó a pedir tiene un día para firmar, y nunca se le promete un enlace que no existe |

Qué oye la persona según el motivo: fuera de plazo → "El plazo para pedir este
adelanto ya cerró"; nunca recibió la oferta → "Por ahora no hay un adelanto
abierto para ti"; falla nuestra → "No pudimos revisar tu solicitud… inténtalo de
nuevo". Ninguno invita a insistir.

**Para reabrirle la ventana a alguien:** Ofertas → Enviar → "Personas sueltas". Si ya había pedido
(oferta en *solicitada*) no se le puede reenviar la oferta: su enlace se regenera desde el expediente,
y se le entrega en cuanto conteste "Sí" o abra /solicitar, mientras siga vigente.

## 3. Arquitectura técnica

- **Meta = un solo mensaje** (la plantilla de oferta). Meta NO guarda el flujo; el
  flujo vive en el código.
- **Webhook** `/api/webhooks/whatsapp`, campo suscrito `messages`. Recibe: mensajes
  entrantes, **respuestas de botón**, y estados de entrega.
- **Seguimiento** (link, gracias) = **mensajes de sesión libres** dentro de la
  ventana de 24 h (que abre el tap) → sin plantilla, sin aprobación.

### Puntos críticos a resolver ANTES de codear

1. **Empate del teléfono (RESUELTO).** El entrante llega como `521XXXXXXXXXX`, pero en la
   base conviven las dos convenciones —con el `1` de móvil y sin él— y uno de cada tres
   empleados está guardado sin el `1`: buscar por igualdad exacta los dejaba fuera,
   contestaban al chatbot y el sistema decía no conocerlos. `variantesDeTelefono`
   (`phone-utils.ts`) busca ambas formas, y cuando ninguna empata la persona recibe
   `UNKNOWN_NUMBER_MESSAGE` en vez de silencio.
2. **Ack rápido + procesamiento async.** Hoy el webhook hace `await handleWebhook`
   y *luego* responde 200. Generar el contrato tarda segundos → Meta hace **timeout
   y reintenta** → doble procesamiento. Solución: **responder 200 de inmediato** y
   procesar en la **cola** (`src/lib/queue`, hoy inline).
3. **Idempotencia de entrada (RESUELTA).** Meta puede **reentregar** el mismo evento. El
   webhook busca en `integration_logs` un inbound con el mismo `correlation_id` antes de
   procesar; si ya está, lo salta y deja `whatsapp.webhook.duplicate_inbound_skipped`.
   Queda una ventana de carrera mínima, tolerable porque las operaciones de fondo (reuso
   del contrato, rechazar la oferta) son idempotentes de todos modos.
4. **Seguridad del webhook.** Poner `WHATSAPP_APP_SECRET` para validar la firma
   `x-hub-signature-256` (hoy falta; en dev se deja pasar, en prod se rechaza).

## 4. Estados (reusa el modelo existente)

No hay máquina de estados nueva:
- `advance_offers.status`: `vigente` / `reemplazada` / `solicitada` / `firmada` / `rechazada`
- `contract_requests.status`: `recibida` / `generando` / `link_generado` / `firmado` / `error` / `reemplazada`
- `contract_attempts`: `generando` / `generado` / `expirado` / `firmado` / `error` + `expires_at` (las 24 h)

El webhook, en cada tap, **lee el estado actual** (`is_current` = oferta de ESTE ciclo)
y responde según la tabla de edge cases.

## 5. Multi-ciclo (ya construido: "reset por ciclo")

Un **lote de importación nuevo = ciclo nuevo**:
- El mismo empleado reimportado → **oferta fresca `vigente`** (`is_current=true`),
  aunque el monto no cambie → **vuelve a ser elegible para enviar**.
- La oferta anterior → `is_current=false`, `status='reemplazada'` (cadena en
  `advance_offer_revisions`).
- La solicitud ACTIVA del ciclo pasado → `reemplazada`, intentos vivos → `expirado`
  (libera el candado de "una activa por empleado").
- **Las solicitudes `firmado` NO se tocan → evidencia de quién firmó preservada.**
- **Una firma que llega DESPUÉS de reemplazar el ciclo se guarda como evidencia pero NO revive la solicitud** (`queHacerConLaFirma`, `firma-tardia.ts`). EasyLex no expone forma de cancelar un documento, así que quien ya tenía abierta la pantalla de firma puede terminarla horas más tarde y el webhook llega igual. Revivir esa solicitud metería un pago con el monto ANTERIOR en un ciclo que la empresa ya cerró, y encima invisible: el Excel de dispersión arma el pago con las solicitudes en `firmado` y el tablero solo mira la oferta vigente. Con el enlace de dos horas esto casi no podía pasar; con uno de un día la rendija dura toda la tarde.
- Reaplicar el MISMO lote sin cambios = no-op (idempotente).
- El empate del empleado entre ciclos es **por RFC** (`upsertEmployee`). Mismo RFC =
  misma fila = historia limpia. ⚠️ Cuidar RFC consistente en los Excel de import
  (RFC distinto = empleado duplicado).

Escenarios:
- **Mismos empleados, ciclo nuevo** → oferta fresca → sí deja reenviar.
- **Empleados nuevos** → oferta nueva, nada que reemplazar.
- **Quién firmó/no el ciclo pasado** → se conserva (por `contract_requests` + `source_batch_id`).
- **Re-ofertar a quien dijo "No"** → sí, cada ciclo genera oferta fresca (deseado).

## 6. Export (flujo de regreso del operador)

- `/api/cycles/[cycleId]/export` → **Excel** (`.xlsx`) **por ciclo**, rol `operaciones`. El archivo hereda el nombre del que se importó, con "firmados" al final, para saber de un vistazo a qué carga corresponde.
- Columnas: **nombre + RFC + monto autorizado + total a pagar**. La decisión **B** (nombre + RFC + monto, sin datos bancarios) se cumple, y se le añadió el **total a pagar** —con comisión e IVA, lo que se le descuenta de nómina— porque son cifras distintas y se necesitan las dos: una para dispersar, otra para el descuento. El total se calcula con la MISMA función que llena el contrato, para que el Excel y el pagaré que firmó la persona no puedan discrepar.
- "Firmó" = `contract_requests.status = 'firmado'` de la oferta de ese lote.
- Cada ciclo exporta a sus propios firmantes (los ciclos anteriores quedan intactos).

## 7. Configuración en Meta (checklist)

> **Lo de la entrega no se decide aquí.** El documento propietario es
> [WhatsApp](whatsapp.md#categoría-de-plantilla-y-entrega-importante), donde está
> con su evidencia: en esta cuenta una plantilla MARKETING **sí entrega** —16 de
> 16 en los dos envíos reales, con el negocio aún sin verificar—. Este checklist
> lo afirmaba por su cuenta y con otras palabras; se quitó para que el dato viva
> en un solo sitio.

- [ ] **Plantilla de oferta** `adelanto_nomina_oferta` — categoría **Marketing**,
      idioma **Español**,
      header con imagen, **botones "Personalizado"** (quick reply): `Sí, lo quiero` /
      `No, gracias`. 3 variables: `{{1}}` Nombre, `{{2}}` Empleador, `{{3}}` Monto. → a aprobación.
- [ ] **Webhook** (Meta for Developers → App → WhatsApp → Configuración):
      callback `https://<dominio-público>/api/webhooks/whatsapp`, verify token =
      `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, **suscribir el campo `messages`**.
- [ ] **`WHATSAPP_APP_SECRET`** (App → Configuración → Básica) en el entorno.
- [ ] Opt-in/consentimiento y (si queda Marketing) verificación de negocio.

## 8. Cambios de código

- [ ] Ruteo de botones en `handleWebhook` (`type: 'button'` / `interactive.button_reply`
      → payload → empleado por teléfono → rama Sí/No).
- [ ] Rama **Sí**: `requestContractFromWhatsApp` (reuso) → mandar link de sesión.
- [ ] Rama **No**: oferta → `rechazada` → mandar "gracias".
- [ ] Edge cases v1 (tabla §2).
- [ ] Ack 200 rápido + proceso en cola; dedup de entrada por message id.
- [ ] Normalización de teléfono MX (521) en el lookup.
- [ ] **Actualizar el ENVÍO de la oferta** al nuevo template: quitar el botón-URL,
      mandar 3 variables + header imagen (quick-reply no lleva parámetro de botón).
- [ ] `requested_from` = `'whatsapp'` (en vez de `'manychat'`).
- [ ] **Visibilidad del operador**: reflejar estado conversacional (respondió Sí/No,
      link enviado, firmado, expirado, no respondió) en cockpit/contratos.
- [ ] (Opcional, recomendado) **Confirmación post-firma**: al llegar el webhook de
      EasyLex (`/api/webhooks/easylex/sign`), mandar WhatsApp "✅ ¡Firmado!".

## 9. Pruebas y rollout

- **Local**: túnel (cloudflared) → apuntar el webhook de Meta al túnel. Probar cada
  rama (Sí, No, doble-tap, expirado, ya-firmó, texto libre) usando los **reset queries**
  del empleado de prueba (Angel, `e9016344`).
- **Rollout por fases**: 1 empleado (Angel) → lote chico → completo. Respetar el
  guard `whatsapp.bulk_send.high_error_rate`.

## 10. Decisiones

**Tomadas:**
- Botones quick-reply Sí/No (no URL). Categoría **Marketing** (entrega a contactos
  nuevos ya comprobada en esta cuenta). Textos de mensaje finales (§2).
- Export **B** (nombre + RFC + monto). Re-ofertar a "No" cada ciclo. Confirmación post-firma: **sí**.
- Empate de empleado por RFC. El plazo del enlace (24 h) va en el mensaje del link (sesión), no en la oferta.
- **Mensajes con retraso**: dos cortes, no uno. Una respuesta de oferta se atiende mientras la ventana la
  aceptaría; cualquier otro mensaje, solo si tiene menos de 30 min. Y una respuesta anterior a la oferta
  vigente no se procesa: al reimportar el ciclo la oferta se reemplaza y el monto cambia.
- **Ventana para pedir** (§2.1): **24 h**, solo la abre el envío de ofertas, sin anclarse a la oferta, por
  persona (no por teléfono), cerrada ante cualquier falla. La regla escrita mide desde la entrega con tope de
  24 h desde el envío, pero al valer ambos lo mismo el tope manda: en la práctica es **un día desde el envío**.
  Fue de 2 h hasta el 2026-09-24; se alargó porque un envío de las 5 de la tarde cerraba a las 7 y de 16
  personas 11 no contestaron. Es un plazo **distinto** del que vive el enlace de firma, aunque hoy midan igual.
  Aplica también a `/solicitar`.

**Abiertas:**
- Opt-in/consentimiento (cómo aceptaron recibir mensajes).
- Túnel (probar) vs deploy (prod).
- Limpiar empleados duplicados (Angel) — data vieja de prueba.
- Vigilar el **quality rating** del número al escalar (muchos mensajes de marketing a
  contactos nuevos → bloqueos/reportes pueden bajar el tier de envío). Bajo riesgo aquí
  (los empleados esperan mensajes de su nómina), pero monitorear.

## 11. Alcance

- **v1**: flujo core (Sí/No) + edge cases §2 + envío del nuevo template + export B +
  ack async + normalización de teléfono + idempotencia.
- **v2**: recordatorios fuera de 24 h (plantilla), re-oferta automática siguiente ciclo,
  "No → luego Sí", métricas (tasa de respuesta, Sí/No, conversión a firmado).

## 12. Notas de implementación / limitaciones conocidas

- **Guarda de `handleNo`** (revisión adversarial): "No" solo rechaza una oferta
  **`vigente`**, con update atómico (`.eq("status","vigente")`). Así un tap tardío de
  "No" sobre el mismo mensaje **no pisa** una oferta ya `firmada`/`solicitada` ni
  contradice un contrato en curso; responde según el estado real.
- **Limitación (v2):** los botones quick-reply **no llevan id de oferta/ciclo**. Si el
  empleado toca "No" sobre el mensaje de un **ciclo anterior**, se rechaza la oferta
  `vigente` **actual** (v1 sí protege contra pisar `firmada`/`solicitada`). Mitigación
  futura: incluir un id de oferta en el payload del botón, o expirar la oferta por tiempo.
- **Lo que contesta la persona sí se guarda** (`integration_logs.request_payload`, pasado por
  `redactPII`), pero `redactPII` tacha el teléfono. Por eso el webhook anota después cada mensaje
  entrante con `entity_id` = empleado y `response_payload.chatbot` = qué hizo el sistema, y el
  expediente lo muestra junto a lo enviado ("Contestó · Escribió · …"). Los mensajes anteriores a
  esa anotación siguen en la base pero **sin dueño**, así que no aparecen en ningún expediente.
- **Respuestas automáticas de WhatsApp Business.** Algunos empleados usan WhatsApp Business con
  mensaje de bienvenida: al llegar la oferta, su teléfono contesta solo ("Gracias por comunicarte…")
  y el bot le responde con la guía. No es una solicitud perdida; en el expediente se ve el texto y
  se reconoce de inmediato.
- **Celulares compartidos (limitación previa).** Si dos personas comparten número, el chatbot atiende a
  la primera fila con oferta vigente que encuentra. La ventana ya no se cruza entre ellas, pero la que
  no recibió la oferta oirá que no hay adelanto abierto.
