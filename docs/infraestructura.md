# Infraestructura y despliegue

> **Estado: CI implementado, despliegue pendiente.** Existe `.github/workflows/ci.yml` (integración continua), pero no hay `Dockerfile` ni `output: "standalone"`, así que **no hay entrega continua**: nada se despliega solo. Este documento describe la arquitectura acordada y lo que falta.

## Integración continua (implementado)

`.github/workflows/ci.yml` corre en cada pull request y en push a `main` o `develop`, con cancelación de ejecuciones obsoletas de la misma rama.

| Job | Qué hace |
|---|---|
| `quality` | `lint` → `typecheck` → `test:unit` → `build` (con variables ficticias) |
| `secrets` | Gitleaks sobre el historial completo |
| `audit` | `pnpm audit --audit-level high` |
| `db-types` | Detecta deriva entre el esquema real y `src/types/database.types.ts`. Se omite si no hay credenciales de Supabase configuradas |

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

### Artifact Registry
Registro privado de imágenes, una por commit etiquetada con su SHA, con control de acceso vía IAM.

### GitHub Actions
El workflow de calidad ya existe (descrito arriba). Falta añadirle los jobs de entrega:

- Merge a `main`: build de la imagen, push al registro, despliegue en Cloud Run.
- Merge a `develop`: despliegue a staging.

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
