# WhatsApp Chatbot — Oferta de adelanto (plan maestro)

> Estado: **plan** (antes de codear). Este documento es el mapa del cambio:
> reemplazar el botón-URL de la oferta por un flujo **conversacional** (botones
> de respuesta rápida Sí/No) manejado por webhook + código.

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
        ├─ ¿ya firmó? ───────────► "Ya firmaste ✅"            │
        ├─ ¿link vivo (<2h)? ────► reenvía el MISMO link       │
        ├─ ¿link expiró (>2h)? ──► genera uno NUEVO            │
        ├─ ¿sin oferta/no elegible? ─► "No tienes adelanto…"   │
        ├─ ¿falla EasyLex? ──────► "Hubo un problema…"         │
        └─ normal ──► genera contrato ──► manda link           └─► oferta = rechazada
                       "⏳ Tienes 2h para firmar: <link>"           "Gracias por confirmar 👍"
```

### Mensajes (finales)

**Rama "Sí, lo quiero":**
```
✅ ¡Listo, [Nombre]! Generamos tu contrato de adelanto por [Monto].

⏳ Tienes 2 horas para firmarlo antes de que expire el enlace:
[link de firma]

Firmas con tu identificación (INE) desde tu celular.
```

**Rama "No, gracias":**
```
👍 Gracias por confirmar, [Nombre]. No haremos el adelanto este periodo.
```

### Edge cases (v1 — imprescindibles)

| Caso | Riesgo si no se maneja | Manejo |
|---|---|---|
| Doble tap en "Sí" (<2h) | Genera 2 contratos → **gasta 2 firmas** | Reusa el link vivo (índice *una-activa-por-empleado* + `getReusableAttempt`) |
| Toca "Sí" tras 2h | Link muerto | Detecta expirado → genera uno nuevo |
| Ya firmó | Contrato de más | "Ya firmaste ✅" |
| No elegible / sin oferta | Algo inválido | "No tienes adelanto disponible…" |
| EasyLex caído | El empleado queda sin respuesta | "Hubo un problema, intenta más tarde" |
| Escribe texto (no botón) | El bot parece muerto | "Usa los botones de arriba 👆" |
| No → luego Sí (cambia de opinión) | Queda bloqueado como rechazada | Permitir reactivar |
| Teléfono no está en la BD | Error en el webhook | Log + ignora |

## 3. Arquitectura técnica

- **Meta = un solo mensaje** (la plantilla de oferta). Meta NO guarda el flujo; el
  flujo vive en el código.
- **Webhook** `/api/webhooks/whatsapp`, campo suscrito `messages`. Recibe: mensajes
  entrantes, **respuestas de botón**, y estados de entrega.
- **Seguimiento** (link, gracias) = **mensajes de sesión libres** dentro de la
  ventana de 24 h (que abre el tap) → sin plantilla, sin aprobación.

### Puntos críticos a resolver ANTES de codear

1. **Empate del teléfono (casi resuelto — solo confirmar).** La normalización de
   **salida ya funciona** (probado con varios teléfonos). Falta confirmar la dirección
   **inversa**: que el entrante `msg.from` (MX suele venir como `521XXXXXXXXXX`) empate
   con el `telefono_normalizado` guardado. Al conectar el webhook: **loguear `msg.from`
   y confirmar que cae en el empleado correcto** — chequeo de 1 minuto, no rediseño.
2. **Ack rápido + procesamiento async.** Hoy el webhook hace `await handleWebhook`
   y *luego* responde 200. Generar el contrato tarda segundos → Meta hace **timeout
   y reintenta** → doble procesamiento. Solución: **responder 200 de inmediato** y
   procesar en la **cola** (`src/lib/queue`, hoy inline).
3. **Idempotencia de entrada.** Meta puede **reentregar** el mismo evento. Hay que
   **deduplicar por el id del mensaje entrante** (guardar procesados) para no generar
   dos veces.
4. **Seguridad del webhook.** Poner `WHATSAPP_APP_SECRET` para validar la firma
   `x-hub-signature-256` (hoy falta; en dev se deja pasar, en prod se rechaza).

## 4. Estados (reusa el modelo existente)

No hay máquina de estados nueva:
- `advance_offers.status`: `vigente` / `reemplazada` / `solicitada` / `firmada` / `rechazada`
- `contract_requests.status`: `recibida` / `generando` / `link_generado` / `firmado` / `error` / `reemplazada`
- `contract_attempts`: `generado` / `expirado` / `firmado` / `error` + `expires_at` (las 2 h)

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

- `/api/cycles/[cycleId]/export` → CSV **por ciclo**.
- Columnas (decisión **B**): **nombre + RFC + monto**. Sin datos bancarios.
- "Firmó" = `contract_requests.status = 'firmado'` de la oferta de ese lote.
- Cada ciclo exporta a sus propios firmantes (los ciclos anteriores quedan intactos).

## 7. Configuración en Meta (checklist)

- [ ] **Plantilla de oferta** `adelanto_nomina_oferta` — categoría **Marketing**
      (en esta cuenta la entrega a contactos nuevos/fríos **ya está comprobada**, así que
      Marketing sí entrega; Servicio exigiría copy factual), idioma **Español**,
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
- Empate de empleado por RFC. El "2 horas" va en el mensaje del link (sesión), no en la oferta.

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
