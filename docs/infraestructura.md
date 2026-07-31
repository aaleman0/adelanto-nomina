# Infraestructura y despliegue

> **Estado: CI implementado, despliegue pendiente.** Existe `.github/workflows/ci.yml` (integración continua), pero no hay `Dockerfile` ni `output: "standalone"`, así que **no hay entrega continua**: nada se despliega solo. Este documento describe la arquitectura acordada y lo que falta.

## Integración continua (implementado)

`.github/workflows/ci.yml` corre en cada pull request y en push a `main` o `develop`, con cancelación de ejecuciones obsoletas de la misma rama.

| Job | Qué hace |
|---|---|
| `quality` | `lint` → `typecheck` → `test:unit` → `build` (con variables ficticias) |
| `secrets` | Gitleaks sobre el historial completo |
| `audit` | `pnpm audit --audit-level high` |
| `db-types` | Detectaría deriva entre el esquema real y `src/types/database.types.ts`. **Ese baseline aún no está commiteado**, así que hay que generarlo primero con `pnpm db:types` (requiere credenciales de Supabase). Mientras no exista, el chequeo se omite y el cliente de Supabase se usa sin el genérico `<Database>` |

Dependabot (`.github/dependabot.yml`) revisa npm semanalmente y las actions mensualmente, agrupando dev-dependencies y parches para no generar decenas de PRs sueltos. Los majors de Next, React y React DOM están excluidos: van acoplados y se suben a mano de forma coordinada.

**La suite E2E no está en CI**, porque hoy no pasaría: el gate de autenticación rompe la suite `api/`. Ver [Testing](testing.md).

Para activar el job `db-types` hacen falta el secret `SUPABASE_ACCESS_TOKEN` y la variable `SUPABASE_PROJECT_ID` en el repositorio, y ejecutar `pnpm db:types` una vez para generar el archivo inicial.

## Opción elegida

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

### Docker
Imagen multi-stage: una etapa compila con `pnpm build`, otra ligera (alpine o distroless) expone el 3000 y ejecuta `next start`. **Sin secretos en la imagen** — se inyectan en runtime.

Para que la imagen sea razonable conviene activar `output: "standalone"` en `next.config.ts`; hoy no está.

### Cloud Run
Escalado automático, HTTPS y TLS gestionados, dominios personalizados, health checks contra `/api/health`, y rollback a revisiones anteriores desde la consola.

La configuración declarativa vive en **`deploy/cloud-run-service.yaml`** (sizing, escalado, SA, sondas, env vars y secretos desde Secret Manager). El sizing es para **un operador + lotes de miles**: 2 vCPU / 2 GiB, `containerConcurrency: 8`, `minScale: 0` (escala a cero entre lotes) y `maxScale: 10` (protege a Supabase y las cuotas externas). La cola es el throttle real, no la instancia.

**Dos planos, a propósito:**

- **Config (la BASE)** → se aplica una vez, y cada vez que cambie algo que no sea la imagen:
  ```bash
  gcloud run services replace deploy/cloud-run-service.yaml --region=REGION
  ```
- **Imagen** → el job `deploy` de CI hace `gcloud run deploy --image ...` en cada merge, conservando todo lo del yaml.

La sonda de arranque es **TCP** (que el proceso escuche), no HTTP contra `/api/health`: ese endpoint devuelve 503 si Supabase está degradado, y usarlo como sonda reiniciaría el contenedor ante un blip de la base. `/api/health` queda para el **uptime check externo** de Cloud Monitoring.

### Artifact Registry
Registro privado de imágenes, una por commit etiquetada con su SHA, con control de acceso vía IAM.

### GitHub Actions
El workflow (`ci.yml`) ya incluye el job **`deploy`**: en push a `main`
(producción) o `develop` (staging), construye la imagen, la sube a Artifact
Registry etiquetada con el SHA, y despliega en Cloud Run. Se salta si GCP no está
configurado (mismo patrón que `db-types`), así que no rompe hasta que lo actives.

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

Todos los secretos en Google Cloud Secret Manager, inyectados por Cloud Run como variables de entorno. Nunca en el repositorio ni en la imagen. Las variables no sensibles se configuran directamente en el servicio.

Esto importa especialmente porque la UI permite guardar credenciales de WhatsApp **en texto plano** en la tabla `settings`. Las variables de entorno tienen precedencia, así que definirlas en Secret Manager neutraliza ese riesgo. Ver [Configuración](configuracion.md).

## Webhooks y dominio

El dominio de producción apunta a Cloud Run. Ahí se configuran:

| Webhook | URL |
|---|---|
| Meta | `https://tu-dominio.com/api/webhooks/whatsapp` |
| EasyLex | `https://tu-dominio.com/api/webhooks/easylex/sign` |

En desarrollo local hace falta un túnel (ngrok o equivalente) para recibirlos.

`EASYLEX_CALLBACK_URL` debe terminar exactamente en `/api/webhooks/easylex/sign`, y `NEXT_PUBLIC_APP_URL` debe ser el dominio real o el OAuth de Google falla.

## Consideraciones específicas de este proyecto

Cuatro cosas que Cloud Run condiciona directamente:

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

**Script:** `scripts/setup-cloud-tasks.sh` crea la cola (con el throttle
afinado), la service account invoker y los permisos IAM. Es idempotente.

```bash
GCP_PROJECT_ID=mi-proyecto RUN_RUNTIME_SA=svc@mi-proyecto.iam.gserviceaccount.com \
  bash scripts/setup-cloud-tasks.sh
```

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
