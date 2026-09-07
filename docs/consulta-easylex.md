# Consulta para el soporte de EasyLex

Tres asuntos abiertos, todos verificados contra la API de producción
(`https://api.easylex.com`) el 2026-09-07. Copiar y enviar tal cual.

---

**Asunto:** Descarga de documentos firmados bloqueada (code 501) + webhook y envío al firmante

Hola,

Integramos EasyLex por API para firmar contratos de adelanto de nómina. La
creación y la firma funcionan correctamente, pero tenemos tres puntos abiertos.
Todo lo de abajo está verificado contra `https://api.easylex.com`.

**Nuestra cuenta:** access-key-id `<PEGAR AQUÍ EL ACCESS KEY ID>`

---

### 1. No podemos descargar los documentos firmados (lo más urgente)

Tenemos documentos correctamente firmados, pero **las tres rutas de descarga
responden 400**:

```
GET /api/public/v2/document/status/doc-biRme0LYZCeEMDOU
  → 200  {"data":{"status":"SIGNED"}}          ← el documento SÍ está firmado

GET /api/public/v2/document/signed/doc-biRme0LYZCeEMDOU
GET /api/public/v2/document/original/doc-biRme0LYZCeEMDOU
GET /api/public/v2/document/summary/doc-biRme0LYZCeEMDOU
  → 400  {"error":{"path":"user","message":"InvalidRequest","code":501}}
```

Se envían las mismas credenciales (`access-key-id` / `secret-access-key`) que
funcionan para crear documentos y consultar su estado, así que no parece un
problema de autenticación. El campo `"path":"user"` nos hace pensar en un
permiso de la cuenta o del plan.

**¿Qué necesitamos habilitar para poder descargar el PDF firmado por API?**

Sin esto no podemos entregarle al empleado su copia del contrato, que es un
requisito del servicio.

---

### 2. Su webhook nos llama al firmarse, pero rechazamos la firma

Configuramos `callbackUrl` por documento y confirmamos que **ustedes sí llaman**
a nuestro endpoint cuando se firma. El problema es que no logramos validar la
firma de la petición y la rechazamos con 401.

Hoy verificamos la cabecera `x-easylex-signature` aceptando dos esquemas: el
secreto compartido en texto plano, o HMAC-SHA256 del cuerpo crudo en hexadecimal
(con o sin prefijo `sha256=`).

**¿Qué cabecera envían exactamente y con qué esquema se calcula?** Si es HMAC,
¿sobre qué cuerpo y con qué codificación (hex o base64)?

---

### 3. ¿Envían la copia firmada al correo del firmante?

Creamos un documento con el correo real del firmante en `signatories[0].email`.
Se firmó correctamente y **no llegó ningún correo** con la copia.

**¿EasyLex envía automáticamente el documento firmado al correo del firmante?**
Si depende de alguna opción (por ejemplo `validateEmail`, que tenemos en
`false`), agradeceríamos saber cuál.

---

Con gusto les damos más identificadores de documentos o trazas si ayuda.

Gracias,
