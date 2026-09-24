@AGENTS.md

# Adelanto de nómina

Backoffice para adelantos de sueldo a empleados de empresas cliente. El ciclo
completo: se importa un CSV de nómina → se ofrece el adelanto por WhatsApp → la
persona contesta "Sí" desde su teléfono → se genera un contrato en EasyLex → lo
firma con su INE → se exporta el Excel de dispersión para pagarle.

**Esto está en producción con dinero y personas reales.** Hay empleados de verdad
recibiendo mensajes de verdad y firmando contratos legalmente vinculantes. Un
error aquí no rompe una pantalla: paga de más, paga a quien no debía, o deja a
alguien sin su adelanto. Trabaja en consecuencia.

## Cómo se escribe aquí

- **Todo en español**: nombres de funciones, variables, comentarios, mensajes de
  commit, textos de pantalla. No mezclar.
- **Los comentarios explican el PORQUÉ, no el qué.** El código ya dice qué hace;
  el comentario dice qué pasa en el mundo real si se cambia. Mira
  `src/lib/contracts/ventana-oferta.ts` para el tono: cada constante cuenta el
  caso que la justifica. Un comentario que solo parafrasea la línea de abajo
  sobra.
- **Cuando un comentario deja de ser cierto, es un bug.** Varias veces un
  razonamiento escrito sobrevivió al cambio que lo invalidaba y el siguiente
  lector lo creyó.
- **Los plazos y textos se derivan de constantes**, nunca se escriben a mano. Las
  "2 horas" vivían repetidas en seis pantallas y se desincronizaron.
- Las decisiones de negocio se extraen a **funciones puras y probadas** con el
  acceso a base aparte (`evaluarVentana`, `pasoAlPedir`, `queHacerConLaFirma`).
  Así se prueba cada caso con el reloj fijo.

## Las reglas de negocio que no se rompen

Son decisiones del cliente, no detalles técnicos. Cambiarlas requiere que el
usuario lo pida explícitamente.

- **Dos plazos, independientes, que hoy coinciden en el número.** La **ventana
  para PEDIR** dura **24 h desde que salió la oferta** (`VENTANA_OFERTA_HORAS` en
  `ventana-oferta.ts`; era 2 h hasta el 2026-09-24). El **enlace para FIRMAR**
  dura **24 h desde que se generó el contrato** (`LINK_TTL_HOURS` en
  `link-ttl.ts`). Se miden desde momentos distintos y responden a reglas
  distintas: **que valgan lo mismo es casualidad, no una relación.** Estuvieron
  derivados del mismo número y eso impedía mover uno sin mover el otro; hay una
  prueba que falla si alguien los vuelve a atar.
- **La ventana la abre solo la empresa**, con un `bulk_contract_offer` que Meta
  aceptó. Se juzga por empleado (el RFC es único; nunca por teléfono, que se
  comparte) y contra la hora en que la persona contestó, no la de procesarlo. La
  regla escrita corre desde que el mensaje **llegó** al teléfono con tope de 24 h
  desde el envío, pero al valer ventana y tope lo mismo el tope manda siempre: en
  la práctica cierra **un día después del envío** para todos.
- **Todo lo que decide si alguien puede pedir falla en CERRADO.** Negarle el
  adelanto a quien lo merecía se arregla reenviándole la oferta; un contrato
  vinculante que nadie ofreció ya no se deshace.
- **El reloj es la única revocación que existe.** EasyLex no expone forma de
  cancelar un documento. Si un contrato ya no debe firmarse, hay que adelantar su
  `expires_at` (lo hace `supersedePreviousContract` al reemplazar un ciclo).
- **Una firma que llega sobre una solicitud que ya no está en curso se guarda
  como evidencia pero NO revive la solicitud** (`firma-tardia.ts`), porque el
  Excel de dispersión arma el pago con las solicitudes en `firmado`.
- **Nunca se revierte una firma** desde el backoffice, y **regenerar crea un
  intento nuevo**: el historial de `contract_attempts` queda íntegro.

## Restricciones del usuario

- **No tocar las plantillas de WhatsApp** —ni texto, ni variables, ni nombre— sin
  pedirlo antes. Están en revisión en Meta y cualquier cambio reinicia la
  aprobación, dejando los envíos sin plantilla varios días.
- **Nunca imprimir secretos**: `.env.local`, la service role key de Supabase, la
  llave privada de EasyLex, tokens de Meta. El ID de llave pública sí se puede.
- **El usuario hace personalmente todo lo de autenticación**: logins, generar
  tokens, pegar credenciales en paneles. No se le piden pegados en el chat.
- **Preguntar antes de desplegar.** Ver abajo: subir a `main` es desplegar.

## Estado de los terceros

Cosas rotas o pendientes que no dependen de este código. Verificar antes de
asumir que ya se resolvieron.

- **EasyLex — la firma no se refleja sola.** Su webhook llega pero se rechaza
  (`easylex.webhook.unauthorized`): su esquema de firma no coincide con el que
  verificamos. Hay que usar "Comprobar si ya firmó" o "Actualizar estados". La
  descarga del PDF firmado responde 400 con `{"code":501,"path":"user"}`. Su
  soporte no contesta desde el 2026-09-07 (`docs/consulta-easylex.md`).
- **EasyLex — `expirationDate` sin confirmar.** Mandamos ISO completo, pero el
  default del propio cliente manda `YYYY-MM-DD`. No sabemos si respeta la hora o
  trunca al día. Con enlaces de 24 h la fecha casi siempre cruza la medianoche.
- **WhatsApp — la política de Meta (§4) prohíbe los "anticipos de sueldo"**, que
  es exactamente este producto. Verificado en la fuente. Pendiente de revisión
  legal del usuario antes de seguir con envíos masivos.
- **WhatsApp — identidad a medias.** El nombre visible "Adelanto Nómina" sigue en
  revisión (el activo es "Orbitware"); la verificación del negocio está en
  `pending_submission`; el perfil del número (logo, descripción, web) está vacío.
- **CI corre en Node 20, pero `@supabase/supabase-js` pide `>=22`.** Local va en
  22. Pendiente subir `NODE_VERSION` en `.github/workflows/ci.yml`.

## Comandos

```bash
pnpm lint          # eslint
pnpm typecheck     # tsc sobre tsconfig.check.json
pnpm test:unit     # vitest — la suite que corre CI
pnpm build         # next build (ejecuta tsc; usa NODE_OPTIONS por memoria)
pnpm test:e2e:api  # Playwright contra el Supabase de pruebas — CI NO lo corre
```

**CI no corre Playwright.** Un cambio puede pasar en verde con una prueba e2e
rota; si tocas algo que cubre la suite e2e, córrela a mano.

## Despliegue

Railway construye con el `Dockerfile` y **despliega cada push a `main`**. No hay
staging: subir a `main` es publicar para los empleados. Cloud Run fue la opción
original y no se usa; sus archivos ya se eliminaron.

## Dónde está todo

`docs/README.md` es el índice y dice qué documento es **propietario** de cada
tema: si un dato aparece en dos sitios, uno está mal. Empieza por
`docs/arquitectura.md`.

En `skills/` hay ocho skills del proyecto (arquitectura, backend, backoffice,
design system, EasyLex, importación CSV, testing, auditoría) con las reglas
específicas de cada área.

Las dos puertas por las que un empleado entra al sistema son `/solicitar/[token]`
(auto-servicio) y el chatbot de WhatsApp; ambas pasan por la misma ventana y
deben decir lo mismo. La tercera superficie pública es `/firmar/[signerId]`.
