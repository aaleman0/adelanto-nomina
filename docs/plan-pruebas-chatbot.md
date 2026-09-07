# Plan de pruebas del chatbot (cuando Meta apruebe la plantilla)

Orden pensado para **gastar el mínimo de firmas de EasyLex**: primero todo lo
gratis, y solo después lo que crea contratos. Cada prueba dice qué observar y
cómo dejar el estado listo para la siguiente.

> Empleado de prueba: **Jose Angel Aleman Prueba** — `ec0b2388-78f6-4fc7-b35f-a5512dc81833`
> (teléfono 5218713330257, $1,000). Es el único con ese teléfono.

---

## 0 · Preparación (imprescindible)

- [ ] **Ajustes → Plantillas → "Sincronizar con Meta"**
      Sin esto el envío no conoce la forma de la plantilla nueva (imagen, 3
      variables, botones de respuesta) y Meta rechaza el mensaje.
- [ ] Confirmar que la plantilla nueva aparece como **aprobada** en esa pantalla.
- [ ] Confirmar que la vieja (`adelanto_nomina_v3`) sale marcada como
      **"no sirve con el flujo actual"**.

---

## 1 · Sin gastar firmas

### 1.1 Que el mensaje salga bien
- [ ] **Ofertas** → elegir la plantilla nueva → enviar **solo a ti**.
- Observar en el teléfono: llega la imagen, tu nombre, tu empleador y el monto
  correctos, y **los dos botones** Sí / No.
- ⚠️ Si el mensaje no llega, revisar el detalle del envío: ahí sale el motivo.

### 1.2 Rechazar (rama "No")
- [ ] Tocar **"No, gracias"**.
- Debe llegar: *"Gracias por confirmar, Jose. No haremos el adelanto este periodo."*
- La oferta queda `rechazada` y en el expediente se ve el cambio.
- **Este es el primer toque de botón real del sistema**: confirma que el camino
  `type: "button"` funciona, que hasta hoy solo tenía pruebas unitarias.

### 1.3 Mensajes que no son respuesta
- [ ] Escribir **"hola"** → debe contestar la guía.
- [ ] Escribir **"no sé"** → guía, y **NO** debe rechazar la oferta (revisar que
      la oferta no cambie de estado).
- [ ] Mandar una **nota de voz** → *"Por aquí solo puedo leer texto"*.
- [ ] Mandar una **foto** → lo mismo.

### 1.4 Insistir sobre una oferta ya rechazada
- [ ] Tocar **"Sí, lo quiero"** ahora que está rechazada.
- Debe decir que no hay adelanto disponible, **sin** generar contrato.

**Reiniciar para la siguiente tanda:**
```sql
update public.advance_offers set status = 'vigente', updated_at = now()
where employee_id = 'ec0b2388-78f6-4fc7-b35f-a5512dc81833' and is_current = true;
```

---

## 2 · Con firmas (cada contrato nuevo cuesta una)

### 2.1 Aceptar (rama "Sí")  — 1 firma
- [ ] Reenviar la oferta y tocar **"Sí, lo quiero"**.
- Debe llegar el enlace **con la hora de vencimiento**.
- Verificar que el enlace empieza con tu dominio (`.../firmar/sig-…`), no con
  `easylex.com`.

### 2.2 Doble toque — **no debe gastar otra firma**
- [ ] Tocar **"Sí"** otra vez, dentro de las 2 horas.
- Debe llegar **el mismo enlace**, no uno nuevo.
- Comprobar en el expediente que sigue habiendo **un solo** intento.

### 2.3 Cambiar de opinión después de pedir
- [ ] Tocar **"No, gracias"** teniendo el contrato ya generado.
- No debe pisar la solicitud en curso; debe responder que ya lo solicitó.

### 2.4 Firmar
- [ ] Abrir el enlace **dentro de las 2 horas** y firmar.
- [ ] Revisar si el expediente cambia solo a **Firmado** (eso probaría que el
      webhook de EasyLex ya funciona) o si sigue pendiente.
- [ ] Si sigue pendiente: **"Comprobar si ya firmó"** en el expediente.

### 2.5 Enlace vencido
- [ ] Con un contrato de más de 2 horas, abrir su enlace → *"Este enlace ya venció"*.
- [ ] Abrir el enlace **directo de EasyLex** (el que queda en el navegador al
      firmar) → **si EasyLex deja firmar, es un hallazgo grave** que hay que
      hablar con ellos.
- [ ] Tocar **"Sí"** otra vez → debe generar uno nuevo con 2 horas frescas.

---

## 3 · En lote

### 3.1 Grupo pequeño primero
- [ ] Cargar el archivo de nómina real (**Nómina → cargar**) y aplicarlo.
- [ ] Enviar a **2 o 3 personas** antes que a los 15.
- Revisar el detalle del envío: cuántos salieron, cuántos fallaron y por qué.

### 3.2 Los 15
- [ ] Enviar al resto.
- [ ] Seguir el avance en **Pendientes** y en el ciclo.
- [ ] Al final: **"Exportar firmados"** y confirmar que el CSV trae a quienes
      firmaron con su monto.

---

## Qué revisar si algo falla

| Síntoma | Dónde mirar |
|---|---|
| El mensaje no llega | Detalle del envío en *Ofertas*; estado de la plantilla en Meta |
| Llega pero el botón no hace nada | Logs de Railway: `whatsapp.chatbot.inbound` |
| Dice que no encuentra a la persona | Su `telefono_normalizado` contra el número desde el que escribe |
| Contrato no se genera | Logs: `easylex.attempt.create_failed`, y la última falla del expediente |
| Firmó pero sigue pendiente | Es el webhook de EasyLex (conocido): usar "Comprobar si ya firmó" |

---

## Lo que sigue sin resolverse

El **webhook de EasyLex** rechaza los avisos porque su esquema de firma no
coincide con el nuestro. Ya está puesto el diagnóstico que registra qué manda:
con el próximo aviso suyo se puede adaptar el verificador. Mientras tanto, la
firma se refleja a petición y no se pierde.
