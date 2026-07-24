#!/usr/bin/env bash
#
# Activa Cloud Tasks para el envío masivo de WhatsApp.
#
# El código de la cola ya está completo (src/lib/queue/*, el worker en
# /api/tasks/whatsapp/send-message). Esto sólo crea la infraestructura de GCP y
# los permisos; luego defines las 4 env vars y despliegas.
#
# La COLA es el throttle: `max-dispatches-per-second` y `max-concurrent-dispatches`
# limitan el ritmo hacia Meta con independencia de cuántas instancias levante
# Cloud Run. Empiezan conservadores y se suben conforme crece tu tier de Meta.
#
# USO
#   Edita las variables de abajo y corre:  bash scripts/setup-cloud-tasks.sh
#   Requiere gcloud autenticado con permisos de admin en el proyecto.
#
# Es idempotente: se puede re-correr; re-aplica el tuning de la cola.
set -euo pipefail

# --- Configuración (edita esto) ---------------------------------------------
PROJECT_ID="${GCP_PROJECT_ID:?define GCP_PROJECT_ID}"
REGION="${CLOUD_TASKS_LOCATION:-us-central1}"
QUEUE="${CLOUD_TASKS_QUEUE:-whatsapp-bulk}"

# Servicio de Cloud Run que recibe las tareas (el propio backoffice).
RUN_SERVICE="${RUN_SERVICE:-adelantos-admin}"
# Service account con la que corre ese servicio de Cloud Run (la que ENCOLA).
RUN_RUNTIME_SA="${RUN_RUNTIME_SA:?define RUN_RUNTIME_SA (SA del servicio Cloud Run)}"

# Service account que Cloud Tasks usa para firmar el token OIDC (la que INVOCA).
INVOKER_SA_NAME="${INVOKER_SA_NAME:-cloud-tasks-invoker}"
INVOKER_SA="${INVOKER_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# Throttle hacia Meta. STANDARD ≈ 80 msg/s, pero el límite real es tu tier de
# mensajería (recipients únicos/24h). Empieza bajo y súbelo con la calidad+tier.
MAX_DISPATCHES_PER_SECOND="${MAX_DISPATCHES_PER_SECOND:-10}"
MAX_CONCURRENT_DISPATCHES="${MAX_CONCURRENT_DISPATCHES:-20}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-5}"
MIN_BACKOFF="${MIN_BACKOFF:-10s}"
MAX_BACKOFF="${MAX_BACKOFF:-300s}"
# ----------------------------------------------------------------------------

echo "▶ Proyecto: ${PROJECT_ID} · región: ${REGION} · cola: ${QUEUE}"
gcloud config set project "${PROJECT_ID}" >/dev/null

echo "▶ Habilitando APIs (Cloud Tasks, Cloud Run, IAM)…"
gcloud services enable cloudtasks.googleapis.com run.googleapis.com iam.googleapis.com >/dev/null

echo "▶ Creando la service account invoker (${INVOKER_SA})…"
gcloud iam service-accounts describe "${INVOKER_SA}" >/dev/null 2>&1 || \
  gcloud iam service-accounts create "${INVOKER_SA_NAME}" \
    --display-name="Cloud Tasks invoker (WhatsApp bulk)"

echo "▶ Creando/actualizando la cola con el throttle afinado…"
if gcloud tasks queues describe "${QUEUE}" --location="${REGION}" >/dev/null 2>&1; then
  ACTION="update"
else
  ACTION="create"
fi
gcloud tasks queues "${ACTION}" "${QUEUE}" \
  --location="${REGION}" \
  --max-dispatches-per-second="${MAX_DISPATCHES_PER_SECOND}" \
  --max-concurrent-dispatches="${MAX_CONCURRENT_DISPATCHES}" \
  --max-attempts="${MAX_ATTEMPTS}" \
  --min-backoff="${MIN_BACKOFF}" \
  --max-backoff="${MAX_BACKOFF}"

echo "▶ Permisos IAM…"
# La SA del servicio Cloud Run debe poder ENCOLAR tareas…
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${RUN_RUNTIME_SA}" \
  --role="roles/cloudtasks.enqueuer" --condition=None >/dev/null
# …y actuar como la SA invoker para adjuntar el token OIDC a cada tarea.
gcloud iam service-accounts add-iam-policy-binding "${INVOKER_SA}" \
  --member="serviceAccount:${RUN_RUNTIME_SA}" \
  --role="roles/iam.serviceAccountUser" --condition=None >/dev/null

# El servicio expone webhooks públicos (Meta/EasyLex) y verifica el OIDC del
# worker EN LA APP (authenticateWorkerRequest), así que no se exige auth de
# Cloud Run IAM. Si prefieres cerrarlo a nivel de Cloud Run, descomenta:
# gcloud run services add-iam-policy-binding "${RUN_SERVICE}" --region="${REGION}" \
#   --member="serviceAccount:${INVOKER_SA}" --role="roles/run.invoker"

cat <<EOF

✅ Cloud Tasks listo. Ahora define estas env vars en el servicio de Cloud Run
   (Secret Manager para lo sensible) y redespliega:

   GCP_PROJECT_ID=${PROJECT_ID}
   CLOUD_TASKS_LOCATION=${REGION}
   CLOUD_TASKS_QUEUE=${QUEUE}
   TASKS_WORKER_BASE_URL=https://TU-DOMINIO        # origen público del servicio
   TASKS_INVOKER_SERVICE_ACCOUNT=${INVOKER_SA}

   Con esas 4 (base_url, invoker_sa, project, queue) el driver pasa de 'inline'
   a 'cloud-tasks' automáticamente. Verifica en los logs:
     queue.driver.selected { kind: 'cloud-tasks' }

   Throttle actual: ${MAX_DISPATCHES_PER_SECOND}/s · ${MAX_CONCURRENT_DISPATCHES} concurrentes.
   Súbelo con:  gcloud tasks queues update ${QUEUE} --location=${REGION} \\
                  --max-dispatches-per-second=N --max-concurrent-dispatches=M
EOF
