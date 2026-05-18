# Guía de Operador — WhatsApp API

**Proyecto:** Adelanto Nómina Backoffice  
**Módulo:** WhatsApp Cloud API (Meta)  
**Versión:** 1.0 — Milestone 4 Final  

---

## Índice

1. [Prerequisitos](#1-prerequisitos)
2. [Configuración inicial de credenciales](#2-configuración-inicial-de-credenciales)
3. [Verificar que la configuración es correcta](#3-verificar-que-la-configuración-es-correcta)
4. [Configurar el Webhook en Meta](#4-configurar-el-webhook-en-meta)
5. [Realizar un envío masivo](#5-realizar-un-envío-masivo)
6. [Revisar el historial de envíos](#6-revisar-el-historial-de-envíos)
7. [Entender los estados de entrega](#7-entender-los-estados-de-entrega)
8. [Monitoreo y alertas](#8-monitoreo-y-alertas)
9. [Solución de problemas frecuentes](#9-solución-de-problemas-frecuentes)
10. [Referencia de endpoints](#10-referencia-de-endpoints)

---

## 1. Prerequisitos

Antes de usar la integración de WhatsApp necesitas:

- Una **cuenta de Meta Business** verificada.
- Una **app de tipo Business** en [Meta for Developers](https://developers.facebook.com).
- Un **número de teléfono** registrado en WhatsApp Business Platform (puede ser un número de prueba durante el desarrollo).
- Las **plantillas de mensaje** aprobadas por Meta (ej: `adelanto_contrato`).
- Acceso al panel de administración del backoffice.

---

## 2. Configuración inicial de credenciales

### Opción A — Variables de entorno (recomendado para producción)

Agrega las siguientes variables al archivo `.env.local` (o al proveedor de secretos de tu infra):

```env
WHATSAPP_ACCESS_TOKEN=EAAxxxxxxxx...       # Token de acceso de la app Meta
WHATSAPP_PHONE_NUMBER_ID=123456789012345   # ID del número de teléfono en Meta
WHATSAPP_WEBHOOK_VERIFY_TOKEN=mi_token_secreto  # Token que tú inventas para verificar el webhook
WHATSAPP_APP_SECRET=abc123def456...        # App Secret de la app Meta
WHATSAPP_BUSINESS_NUMBER=521XXXXXXXXXX     # Número de teléfono de negocio (con código de país)
```

> **¿Dónde obtengo estos valores?**  
> En [Meta for Developers](https://developers.facebook.com) → tu App → WhatsApp → Configuración.

### Opción B — UI del backoffice

1. Ve a **Configuración → WhatsApp** en el sidebar.
2. Completa el formulario con los valores correspondientes.
3. Haz clic en **Guardar configuración**.

> **Nota:** El Access Token y App Secret se almacenan en la tabla `settings` de Supabase cifrados por la capa de servicio. Las env vars tienen precedencia sobre los valores de la base de datos.

---

## 3. Verificar que la configuración es correcta

### Desde el backoffice

Ve a **Configuración → WhatsApp**. Si hay errores de configuración verás una alerta roja con los campos faltantes.

### Desde el endpoint de salud

```bash
curl https://tu-dominio.com/api/health
```

Respuesta esperada cuando todo está bien:

```json
{
  "ok": true,
  "status": "ok",
  "timestamp": "2025-05-16T12:00:00.000Z",
  "services": {
    "supabase": { "ok": true, "configured": true, "error": null },
    "whatsapp": {
      "ok": true,
      "configured": true,
      "errors": [],
      "errorRate24h": 0,
      "alerting": false
    }
  }
}
```

Si `whatsapp.ok` es `false`, el campo `errors` lista qué variables faltan.

### Desde el endpoint de config

```bash
curl https://tu-dominio.com/api/whatsapp/config
```

```json
{
  "ok": true,
  "config": {
    "whatsapp_phone_number_id": "123456789012345",
    "whatsapp_business_number": "521XXXXXXXXXX"
  },
  "envValid": true,
  "envErrors": []
}
```

---

## 4. Configurar el Webhook en Meta

El webhook recibe notificaciones de Meta cuando un mensaje es enviado, entregado, leído o falla.

### Pasos

1. En Meta for Developers → WhatsApp → Configuración → Webhooks.
2. En **URL de Callback** ingresa:  
   `https://tu-dominio.com/api/webhooks/whatsapp`
3. En **Verify Token** ingresa el mismo valor que pusiste en `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
4. Selecciona el campo **messages** para recibir eventos de mensajes y estados.
5. Haz clic en **Verificar y guardar**.

Meta enviará un GET a tu endpoint con `hub.mode=subscribe` y el token. El backoffice responderá con el `hub.challenge` para confirmar la verificación.

### Verificar que el webhook funciona

```bash
curl "https://tu-dominio.com/api/webhooks/whatsapp\
?hub.mode=subscribe\
&hub.verify_token=MI_TOKEN\
&hub.challenge=12345"
# Debe responder: 12345
```

---

## 5. Realizar un envío masivo

### Desde la UI

1. Ve a **WhatsApp → Nuevo envío** (o haz clic en el botón del dashboard).
2. Selecciona el **modo**:
   - **Por importación**: selecciona una importación CSV existente. Solo se envía a empleados de esa importación que sean elegibles.
   - **Manual**: ingresa los IDs de empleados específicos.
3. (Opcional) Especifica el nombre de la plantilla si quieres usar una diferente a la predeterminada (`adelanto_contrato`).
4. Haz clic en **Validar elegibilidad** para ver cuántos empleados recibirán el mensaje.
5. Si el resultado es correcto, confirma con **Enviar mensajes**.
6. Un toast te confirmará el resultado con el conteo de enviados y fallidos.

### Desde la API (integración programática)

**Validar elegibilidad antes de enviar:**

```bash
curl -X POST "https://tu-dominio.com/api/whatsapp/bulk?action=validate" \
  -H "Content-Type: application/json" \
  -d '{"mode": "import", "importId": "uuid-de-la-importacion"}'
```

Respuesta:
```json
{ "ok": true, "total": 50, "eligible": 43, "employees": [...] }
```

**Iniciar envío masivo:**

```bash
curl -X POST "https://tu-dominio.com/api/whatsapp/bulk" \
  -H "Content-Type: application/json" \
  -d '{"mode": "import", "importId": "uuid-de-la-importacion", "templateName": "adelanto_contrato"}'
```

Respuesta:
```json
{
  "ok": true,
  "bulkSendId": "uuid-del-envio",
  "total": 50,
  "eligible": 43,
  "sent": 41,
  "failed": 2,
  "status": "completed",
  "errors": [...]
}
```

> **Límites:** Los mensajes se envían en lotes de 100 con 1 segundo de pausa entre lotes. Un envío de 1,000 empleados tarda ~10 segundos.

---

## 6. Revisar el historial de envíos

### Desde la UI

Ve a **WhatsApp → Historial**. Puedes filtrar por:

- **Estado**: `sending`, `completed`, `failed`
- **Modo**: `import`, `manual`
- **Fecha desde / Fecha hasta**

Haz clic en cualquier envío de la lista para ver el **detalle** con el estado de entrega por empleado.

En la vista de detalle también puedes buscar por **RFC** del empleado.

### Desde la API

```bash
# Historial paginado
curl "https://tu-dominio.com/api/whatsapp/bulk/history?page=1&pageSize=20&status=completed"

# Detalle de un envío
curl "https://tu-dominio.com/api/whatsapp/bulk/detail?id=uuid-del-envio&page=1&q=RFC1234"
```

---

## 7. Entender los estados de entrega

| Estado      | Descripción                                                              |
|-------------|--------------------------------------------------------------------------|
| `sent`      | El mensaje fue aceptado por la API de Meta y está en cola de entrega.    |
| `delivered` | El mensaje llegó al dispositivo del destinatario.                        |
| `read`      | El destinatario abrió el mensaje.                                        |
| `failed`    | El mensaje no pudo entregarse (número inválido, teléfono apagado, etc.). |

Los estados `delivered` y `read` se actualizan automáticamente cuando Meta envía las notificaciones al webhook.

---

## 8. Monitoreo y alertas

### Health Check automático

El endpoint `/api/health` reporta:

- Conectividad con Supabase
- Estado de las credenciales de WhatsApp
- **Tasa de error en las últimas 24 horas** (`errorRate24h`)
- Si `alerting: true`, la tasa de error supera el 10%

### Alertas de error rate en envíos

Cuando un envío masivo finaliza con más del **10% de mensajes fallidos**, se emite un log de nivel `WARN` con el siguiente contexto:

```json
{
  "level": "WARN",
  "event": "whatsapp.bulk_send.high_error_rate",
  "bulkSendId": "...",
  "errorRate": 25,
  "sent": 75,
  "failed": 25,
  "totalAttempted": 100,
  "threshold": 10,
  "action": "Revisar configuración de WhatsApp API o lista de teléfonos."
}
```

### Integrar con sistemas externos

En producción, puedes configurar tu plataforma de logs (Datadog, Logtail, etc.) para crear alertas cuando aparezcan logs con `event: "whatsapp.bulk_send.high_error_rate"` o `event: "health.whatsapp.high_error_rate"`.

---

## 9. Solución de problemas frecuentes

### "WhatsApp no está configurado"

**Causa:** Faltan variables de entorno (`WHATSAPP_ACCESS_TOKEN` o `WHATSAPP_PHONE_NUMBER_ID`).  
**Solución:** Configura las variables en `.env.local` o en la UI de Configuración → WhatsApp.

### "El webhook no se verifica"

**Causa:** El `hub.verify_token` que envía Meta no coincide con `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.  
**Solución:** Asegúrate de que el token en Meta for Developers sea exactamente igual al de tu env var. No uses espacios extra.

### "Los mensajes se envían pero nunca pasan a 'delivered'"

**Causa:** El webhook no está configurado o no apunta a la URL correcta.  
**Solución:** Verifica la URL del webhook en Meta for Developers y que el servidor sea accesible públicamente (no `localhost`).

### "Error al enviar: número inválido"

**Causa:** El número de teléfono del empleado no está en formato internacional o no está registrado en WhatsApp.  
**Solución:** Los números deben estar en `telefono_normalizado` con formato `521XXXXXXXXXX` (sin `+`, con código de país `52` y `1` de celular para México).

### "Error rate alto después de un envío"

**Causa:** Lista de teléfonos desactualizados, token de acceso expirado, o límite de mensajes de la API de Meta alcanzado.  
**Solución:**
1. Verifica que el Access Token no haya expirado en Meta for Developers.
2. Revisa los errores específicos en el detalle del envío (campo `error_message` por empleado).
3. Contacta a Meta si el error es de límite de tasa (`rate limit`).

---

## 10. Referencia de endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/health` | Estado de salud del sistema (Supabase + WhatsApp) |
| `GET` | `/api/whatsapp/config` | Obtener configuración actual |
| `POST` | `/api/whatsapp/config` | Guardar configuración |
| `GET` | `/api/webhooks/whatsapp` | Verificación del webhook por Meta |
| `POST` | `/api/webhooks/whatsapp` | Recibir eventos de mensajes/delivery de Meta |
| `POST` | `/api/whatsapp/bulk` | Iniciar envío masivo (`?action=send` o `?action=validate`) |
| `GET` | `/api/whatsapp/bulk/history` | Historial paginado de envíos masivos |
| `GET` | `/api/whatsapp/bulk/detail` | Detalle de un envío masivo (`?id=<uuid>`) |
| `GET` | `/api/whatsapp/stats` | Estadísticas de mensajes (dashboard) |
| `GET` | `/api/whatsapp/templates` | Listar plantillas en base de datos |
| `POST` | `/api/whatsapp/templates/sync` | Sincronizar plantillas desde Meta |

---

*Guía generada para la migración WhatsApp API — Milestone 4 Final.*
