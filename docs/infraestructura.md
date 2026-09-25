# Infraestructura y despliegue

> **Estado (2026-09-15): producción en Railway.** Railway construye con el `Dockerfile` y despliega solo cada push a `main`. La integración continua sigue en `.github/workflows/ci.yml`. La arquitectura con Google Cloud Run descrita más abajo fue la opción original y **no se usa**; su workflow y su job de CI se eliminaron.

## Integración continua (implementado)

`.github/workflows/ci.yml` corre en cada pull request y en push a `main` o `develop`, con cancelación de ejecuciones obsoletas de la misma rama.

| Job | Qué hace |
|---|---|
| `quality` | `lint` → `typecheck` → `test:unit` → `build` (con variables ficticias) |
| `secrets` | Gitleaks sobre el historial completo |
| `audit` | `pnpm audit --audit-level high` |
| `db-types` | Detectaría deriva entre el esquema real y `src/types/database.types.ts`. **Ese baseline aún no está commiteado**, así que hay que generarlo primero con `pnpm db:types` (requiere credenciales de Supabase). Mientras no exista, el chequeo se omite y el cliente de Supabase se usa sin el genérico `<Database>` |

**CI corre en Node 20 y `@supabase/supabase-js` pide `>=22`.** `NODE_VERSION` está fijado en `"20"` en el workflow y el `Dockerfile` construye sobre `node:20-slim`, mientras el paquete instalado declara `engines.node: ">=22.0.0"`. Local va en 22, así que el desajuste no se ve al trabajar: se vería en un CI verde que oculta un runtime que el propio cliente de base de datos no soporta. Pendiente subir las dos a 22.

Dependabot (`.github/dependabot.yml`) revisa npm semanalmente y las actions mensualmente, agrupando dev-dependencies y parches para no generar decenas de PRs sueltos. Los majors de Next, React y React DOM están excluidos: van acoplados y se suben a mano de forma coordinada.

**La suite E2E no está en CI**, porque hoy no pasaría: el gate de autenticación rompe la suite `api/`. Ver [Testing](testing.md).

Para activar el job `db-types` hacen falta el secret `SUPABASE_ACCESS_TOKEN` y la variable `SUPABASE_PROJECT_ID` en el repositorio, y ejecutar `pnpm db:types` una vez para generar el archivo inicial.

## Opción original (no se usa)

Docker + Google Cloud Run + Artifact Registry + GitHub Actions + Cloud Monitoring.

Se eligió como equilibrio entre control operativo y simplicidad: contenedor portable, entorno serverless gestionado, CI/CD automatizado y observabilidad, sin administrar servidores ni Kubernetes.

```
GitHub Repo
    │
    ▼
GitHub Actions ──────► Artifact Registry
  (lint, tsc, tests,      (imagen etiquetada
   build, push)            con el SHA)
                                │
                                ▼
                         Google Cloud Run
                          (Next.js, :3000)
                                │
          ┌─────────────────────┼─────────────────────┐
          ▼                     ▼                     ▼
      Supabase             Meta WhatsApp           EasyLex
   (Postgres+Auth+          Cloud API             (contratos)
      Storage)
```

## Componentes

De lo que sigue, **solo Docker y GitHub Actions están vivos**: la imagen es la que
Railway construye y el CI es el que corre en cada PR. Cloud Run, Artifact Registry
y Cloud Monitoring pertenecen a la opción original y se conservan por su
dimensionado y su razonamiento, no porque estén en uso.

### Docker
Imagen multi-stage sobre `node:20-slim`, en tres etapas: `deps` instala con pnpm (capa cacheable), `builder` compila con `pnpm build`, y `runner` copia sólo el standalone + `.next/static` + `public`, expone el **8080** y arranca con `node server.js` como usuario `node`, sin privilegios. **Sin secretos en la imagen**: los placeholders de build van inline en el `RUN` que los usa, para que no queden en los metadatos de la capa, y los reales se inyectan en runtime.

`output: "standalone"` **ya está activo** en `next.config.ts`, y es lo que hace que el runner no necesite el árbol completo de `node_modules`. No es cosmético: sin él no se genera el `server.js` que el `CMD` ejecuta.

### Cloud Run
Escalado automático, HTTPS y TLS gestionados, dominios personalizados, health checks contra `/api/health`, y rollback a revisiones anteriores desde la consola.

La configuración declarativa vivía en **`deploy/cloud-run-service.yaml`**, que se **eliminó el 2026-09-15** junto con el resto de Cloud Run: ya no hay yaml que aplicar ni `gcloud run services replace` que correr, ni el plano de imagen separado que dependía del job `deploy` de CI. Se conserva aquí el dimensionado por si algún día hace falta un entorno equivalente, porque razonarlo de nuevo cuesta: era para **un operador + lotes de miles** —2 vCPU / 2 GiB, `containerConcurrency: 8`, `minScale: 0` (escala a cero entre lotes) y `maxScale: 10`, que protege a Supabase y las cuotas externas—. La cola es el throttle real, no la instancia.

La sonda de arranque es **TCP** (que el proceso escuche), no HTTP contra `/api/health`: ese endpoint devuelve 503 si Supabase está degradado, y usarlo como sonda reiniciaría el contenedor ante un blip de la base. `/api/health` queda para el **uptime check externo** de Cloud Monitoring.

### Artifact Registry
Registro privado de imágenes, una por commit etiquetada con su SHA, con control de acceso vía IAM.

### GitHub Actions
Hubo un job **`deploy`** que en push a `main` construía la imagen, la subía a
Artifact Registry etiquetada con el SHA y desplegaba en Cloud Run. **Se eliminó
el 2026-09-15**: hoy `ci.yml` sólo tiene `quality`, `secrets`, `audit` y
`db-types`, y nada en GitHub Actions publica nada. Quien despliega es Railway, al
recibir el push a `main`.

**Autenticación sin llaves (Workload Identity Federation):** no hay JSON de
service account en los secretos del repo; GitHub intercambia un token OIDC por
credenciales de corta duración. Hay que crear un Workload Identity Pool + provider
en GCP y darle a la SA de deploy los roles `roles/run.admin`,
`roles/artifactregistry.writer` e `roles/iam.serviceAccountUser`.

**Variables por entorno** (GitHub → Settings → Environments → `production` /
`staging` → Variables). El job las lee con `vars.*`, así que cada entorno apunta
a su propio proyecto/servicio:

| Variable | Ejemplo |
|---|---|
| `GCP_WIF_PROVIDER` | `projects/123/locations/global/workloadIdentityPools/gh/providers/gh` |
| `GCP_DEPLOY_SA` | `deployer@mi-proyecto.iam.gserviceaccount.com` |
| `GCP_PROJECT_ID` | `mi-proyecto` |
| `GCP_REGION` | `us-central1` |
| `ARTIFACT_REGISTRY_REPO` | `contenedores` |
| `CLOUD_RUN_SERVICE` | `adelantos-admin` |
| `NEXT_PUBLIC_APP_URL` | `https://tu-dominio.com` (se **inlinea en build**, por eso es var de build, distinta por entorno) |

El deploy **solo cambia la imagen**; las env vars y los secretos viven ligados al
servicio de Cloud Run (Secret Manager) y se conservan entre revisiones. Protege
el entorno `production` con *required reviewers* en GitHub para exigir aprobación
antes de cada deploy.

### Cloud Monitoring y Logging
Logs centralizados y métricas de latencia, tráfico y errores. Alertas sugeridas: caída del servicio, tasa de error sobre umbral, latencia p95 elevada.

El logger emite JSON en producción (`src/lib/logger.ts`), listo para consultas estructuradas. Eventos que conviene alertar: `whatsapp.bulk_send.high_error_rate`, `health.whatsapp.high_error_rate`, `whatsapp.bulk_send.count_mismatch`, `whatsapp.bulk_detail.inconsistent_data`.

## Secretos

Todos los secretos como variables de entorno del servicio de **Railway**, cargadas en su panel. Secret Manager era del plan de Cloud Run, que no se usó. Nunca en el repositorio ni en la imagen. Las variables no sensibles se configuran en el mismo sitio.

Esto importa especialmente porque la UI permite guardar credenciales de WhatsApp **en texto plano** en la tabla `settings`. Las variables de entorno tienen precedencia, así que definirlas en Secret Manager neutraliza ese riesgo. Ver [Configuración](configuracion.md).

## Webhooks y dominio

El dominio de producción apunta al servicio de Railway (Cloud Run no se usa). Ahí se configuran:

| Webhook | URL |
|---|---|
| Meta | `https://tu-dominio.com/api/webhooks/whatsapp` |
| EasyLex | `https://tu-dominio.com/api/webhooks/easylex/sign` |

En desarrollo local hace falta un túnel (ngrok o equivalente) para recibirlos.

`EASYLEX_CALLBACK_URL` debe terminar exactamente en `/api/webhooks/easylex/sign`, y `NEXT_PUBLIC_APP_URL` debe ser el dominio real o el OAuth de Google falla.

## Consideraciones específicas de este proyecto

Cuatro cosas que el entorno de despliegue condiciona directamente (hoy Railway; se razonaron para Cloud Run, pero valen igual):

1. **El envío masivo puede exceder el timeout** mientras siga en modo inline. El soporte de Cloud Tasks ya está implementado y se activa con cuatro variables de entorno; hasta entonces el envío corre dentro del request en lotes de 100. Es la razón más probable de un envío truncado en producción. Ver [WhatsApp](whatsapp.md#cola).
2. **La generación de PDF consume CPU y memoria.** Ajustar los límites del servicio en consecuencia.
3. **Las migraciones se aplican a mano** pegándolas en el SQL Editor de Supabase; no hay paso de migración en el pipeline. Cualquier despliegue que dependa de un cambio de esquema requiere aplicarlo antes, manualmente.
4. **`src/lib/supabase/server.ts` lee `.env.local` desde disco** en tiempo de ejecución. En el contenedor ese archivo no existe y la lectura no hace nada — el comportamiento correcto —, pero explica diferencias entre local y producción al depurar.

Costos: para un backoffice interno, Cloud Run suele ser económico; dependen de tráfico, concurrencia y tiempo de CPU.

## Activar Cloud Tasks (envío masivo a escala)

Para un operador que dispara lotes de **miles** de empleados, la cola no es
opcional: el envío inline excede el timeout de Cloud Run y trunca el lote. El
código ya está completo (`src/lib/queue/*`, worker en
`/api/tasks/whatsapp/send-message`, una tarea por mensaje, OIDC, idempotente);
sólo falta la infraestructura de GCP y 4 variables.

**Ya no hay script.** `scripts/setup-cloud-tasks.sh` —que creaba la cola con el
throttle afinado, la service account invoker y los permisos IAM, y era
idempotente— se eliminó el 2026-09-15 con el resto de Cloud Run. Hoy la cola, la
service account y los permisos habría que crearlos a mano; y como producción
corre fuera de GCP, el runtime tampoco encuentra identidad sola: autentica por
ADC (`src/lib/queue/cloud-tasks.ts`).

Luego define en el servicio de Cloud Run (Secret Manager para lo sensible):

| Variable | Valor |
|---|---|
| `GCP_PROJECT_ID` | tu proyecto |
| `CLOUD_TASKS_LOCATION` | región (p. ej. `us-central1`) |
| `CLOUD_TASKS_QUEUE` | `whatsapp-bulk` |
| `TASKS_WORKER_BASE_URL` | origen público del servicio |
| `TASKS_INVOKER_SERVICE_ACCOUNT` | la SA invoker que creó el script |

Con esas presentes, el driver pasa de `inline` a `cloud-tasks` solo. Verifica en
logs: `queue.driver.selected { kind: 'cloud-tasks' }`.

**El throttle es la cola, no el código.** `max-dispatches-per-second` y
`max-concurrent-dispatches` limitan el ritmo hacia Meta con independencia de
cuántas instancias levante Cloud Run. Arrancan conservadores (10/s, 20
concurrentes) porque el límite real es tu **tier de mensajería de Meta**
(recipients únicos/24h); súbelos conforme crece el tier y la calidad. Para
subirlos no hace falta redeploy, sólo `gcloud tasks queues update`.

**Nota:** la generación de contrato/PDF (`request-contract`) sigue inline; si
también escala a miles, merece la misma cola con un worker y un throttle propios
(afinado a la cuota de Google Docs), no la de WhatsApp.

## Alternativas descartadas

- **Vercel** — más simple, menos control sobre el runtime y la imagen.
- **AWS ECS Fargate** — más granular, pero añade ALB, VPC e IAM para un proyecto de este tamaño.
- **Kubernetes** — excesivo para un monolito Next.js con base gestionada.

## Pasos para implementar

1. Añadir `output: "standalone"` a `next.config.ts`.
2. Crear el `Dockerfile` multi-stage.
3. Configurar el proyecto en GCP y el repositorio en Artifact Registry.
4. Crear el servicio de Cloud Run con sus variables de entorno.
5. Cargar los secretos en Secret Manager.
6. Añadir los jobs de entrega al workflow de CI existente.
7. Configurar dominio personalizado y los dos webhooks.
8. Definir alertas en Cloud Monitoring.
9. Resolver los pendientes de seguridad del [checklist de producción](configuracion.md#checklist-antes-de-producción) antes de abrir el servicio.

Ver también: [Configuración](configuracion.md) · [Arquitectura](arquitectura.md) · [Testing](testing.md)
