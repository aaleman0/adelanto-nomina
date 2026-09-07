# Túnel para probar el chatbot de WhatsApp en local

Meta no puede llamar a `localhost`: para que el webhook reciba los botones
"Sí, lo quiero" / "No, gracias" hace falta una **URL pública HTTPS** que apunte a
tu máquina. Esto se hace con un túnel (ngrok, ya instalado).

> Esto es solo para PROBAR. En producción la URL pública es el dominio real y
> estos pasos se reemplazan por el deploy (ver `docs/go-live.md`).

---

## 1. Levantar el túnel

Con el servidor de desarrollo corriendo en el puerto 3000, en OTRA terminal:

```bash
ngrok http 3000
```

Copia la URL `https://...ngrok-free.app` que aparece en `Forwarding`.
Es tu **URL pública** en los pasos siguientes.

⚠️ **En el plan gratuito la URL cambia cada vez que reinicias ngrok.** Si lo
reinicias, hay que repetir los pasos 2 y 4. Para evitarlo, ngrok permite un
dominio estático gratuito por cuenta (`ngrok http --domain=<tu-dominio> 3000`).

---

## 2. Apuntar el sistema a esa URL

En `.env.local`:

```bash
NEXT_PUBLIC_APP_URL=https://TU-URL.ngrok-free.app
EASYLEX_CALLBACK_URL=https://TU-URL.ngrok-free.app/api/webhooks/easylex/sign
WHATSAPP_APP_SECRET=<App Secret de Meta — ver paso 3>
```

Por qué cada una:

- **`NEXT_PUBLIC_APP_URL`** — de aquí sale el enlace de firma que se guarda en cada
  contrato (`.../firmar/<signerId>`) y el de auto-servicio (`.../solicitar/<token>`).
  Si queda en `localhost`, el empleado no puede abrirlos desde su teléfono.
- **`EASYLEX_CALLBACK_URL`** — es donde EasyLex avisa que el empleado ya firmó. Sin
  esto, la firma no se refleja sola en el sistema.
- **`WHATSAPP_APP_SECRET`** — con esto se valida que el webhook viene de Meta y no de
  un tercero.

**Reinicia el servidor de desarrollo** después de editar: Next lee las variables
al arrancar, no en caliente.

---

## 3. Sacar el App Secret de Meta

Meta for Developers → tu App → **Configuración → Básica** → campo **App Secret** →
"Mostrar". Cópialo a `WHATSAPP_APP_SECRET`.

---

## 4. Registrar el webhook en Meta

Meta for Developers → tu App → **WhatsApp → Configuración** → sección Webhook:

1. **URL de devolución de llamada:**
   `https://TU-URL.ngrok-free.app/api/webhooks/whatsapp`
2. **Token de verificación:** el mismo valor que tienes en
   `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
3. Guardar. Meta hace una llamada de verificación en ese momento; si el servidor
   está arriba y el token coincide, queda verificado.
4. **Suscribir el campo `messages`.** ⚠️ Este es el paso que se olvida: sin él,
   Meta verifica la URL pero **nunca te avisa** cuando alguien toca un botón.

### Comprobar que quedó bien (sin depender de Meta)

```bash
curl "https://TU-URL.ngrok-free.app/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=TU_VERIFY_TOKEN&hub.challenge=12345"
```

Debe responder exactamente `12345`. Si responde `Forbidden`, el token no coincide.

---

## 5. Sincronizar la plantilla aprobada

Una vez que Meta apruebe la plantilla, entra a **Ajustes → Plantillas** y pulsa
**"Sincronizar con Meta"**.

Es necesario: el envío decide qué mandar (imagen, número de variables, si lleva
botón de URL) leyendo la definición sincronizada. Sin sincronizar, cae al
comportamiento de las plantillas viejas y Meta rechazaría el mensaje.

---

## 6. Probar el juego completo

1. **Enviar la oferta** desde *Ofertas*, eligiendo la plantilla nueva y a un solo
   empleado de prueba.
2. En el teléfono debe llegar el mensaje con los dos botones.
3. **Tocar "Sí, lo quiero"** → en la terminal del servidor debe aparecer
   `whatsapp.chatbot.inbound` con `kind: "si"`, y en el teléfono llega el mensaje
   con el enlace de firma y la hora de vencimiento.
4. **Abrir el enlace dentro de las 2 horas** → entra a firmar.
   Pasadas las 2 horas → "Este enlace ya venció".
5. Con otro empleado, **tocar "No, gracias"** → llega el "gracias" y la oferta
   queda como rechazada.

### Si algo no pasa

| Síntoma | Dónde mirar |
|---|---|
| El mensaje no llega | Estado de la plantilla en Meta (¿aprobada?) y el detalle del envío en *Ofertas* |
| Llega pero al tocar el botón no pasa nada | ¿Está suscrito el campo `messages`? ¿ngrok sigue arriba con la misma URL? |
| En la terminal sale `employee_not_found` | El teléfono del empleado no coincide con el que manda Meta (`msg.from`) |
| El enlace de firma no abre | ¿`NEXT_PUBLIC_APP_URL` es la URL del túnel y se reinició el servidor? |

---

## Al terminar las pruebas

Regresa `NEXT_PUBLIC_APP_URL` a `http://localhost:3000` si vas a seguir trabajando
en local sin túnel. Los enlaces de firma que se generaron durante la prueba quedan
apuntando a la URL del túnel y dejarán de funcionar cuando lo cierres — es normal,
solo hay que regenerarlos.
