#!/usr/bin/env bash
#
# Crea en Secret Manager todos los secretos que el servicio necesita, y le da
# acceso a la service account de Cloud Run.
#
# Los nombres coinciden EXACTAMENTE con los `secretKeyRef` de
# deploy/cloud-run-service.yaml. Si cambias uno aquí, cámbialo allá.
#
# USO
#   1. Copia .env.local a un archivo de producción y ajústalo:
#        cp .env.local .env.produccion    # y edita los valores reales de prod
#   2. Corre:
#        GCP_PROJECT_ID=tu-proyecto RUN_RUNTIME_SA=adelantos-admin-run@tu-proyecto.iam.gserviceaccount.com \
#          bash scripts/crear-secretos.sh .env.produccion
#
# SEGURIDAD
#   · Los valores se leen del archivo y se mandan por stdin: no quedan en el
#     historial del shell ni en la línea de comandos (donde otros procesos de la
#     máquina podrían verlos con `ps`).
#   · El archivo .env.produccion NO debe commitearse. Bórralo al terminar.
#
# Es idempotente: si el secreto ya existe, añade una VERSIÓN nueva en vez de fallar.
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:?define GCP_PROJECT_ID}"
RUN_RUNTIME_SA="${RUN_RUNTIME_SA:?define RUN_RUNTIME_SA (SA con la que corre Cloud Run)}"
ENV_FILE="${1:?pasa la ruta del archivo de entorno, ej: scripts/crear-secretos.sh .env.produccion}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "No encuentro el archivo '$ENV_FILE'." >&2
  exit 1
fi

# Pares "NOMBRE_DE_LA_VARIABLE:nombre-del-secreto-en-gcp".
# El orden es el del flujo: base de datos → WhatsApp → EasyLex → enlaces.
SECRETOS=(
  "SUPABASE_SERVICE_ROLE_KEY:supabase-service-role-key"
  "SUPABASE_ANON_KEY:supabase-anon-key"
  "WHATSAPP_ACCESS_TOKEN:whatsapp-access-token"
  "WHATSAPP_APP_SECRET:whatsapp-app-secret"
  "WHATSAPP_WEBHOOK_VERIFY_TOKEN:whatsapp-webhook-verify-token"
  "EASYLEX_ACCESS_KEY_ID:easylex-access-key-id"
  "EASYLEX_SECRET_ACCESS_KEY:easylex-secret-access-key"
  "EASYLEX_WEBHOOK_SECRET:easylex-webhook-secret"
  "SOLICITAR_TOKEN_SECRET:solicitar-token-secret"
)

# Lee una variable del archivo de entorno sin ejecutarlo (un `source` correría
# cualquier cosa que hubiera dentro). Quita comillas envolventes si las trae.
leer_var() {
  local nombre="$1"
  sed -n "s/^${nombre}=//p" "$ENV_FILE" | tail -n 1 | sed 's/^["'\'']//; s/["'\'']$//'
}

echo "Proyecto:  $PROJECT_ID"
echo "Cuenta de servicio de Cloud Run: $RUN_RUNTIME_SA"
echo "Archivo:   $ENV_FILE"
echo

faltantes=()

for par in "${SECRETOS[@]}"; do
  var="${par%%:*}"
  secreto="${par##*:}"
  valor="$(leer_var "$var" || true)"

  if [[ -z "$valor" ]]; then
    faltantes+=("$var")
    printf '  ⚠️  %-34s sin valor en el archivo — se omite\n' "$var"
    continue
  fi

  if gcloud secrets describe "$secreto" --project="$PROJECT_ID" >/dev/null 2>&1; then
    printf '  ↻  %-34s → %s (versión nueva)\n' "$var" "$secreto"
  else
    gcloud secrets create "$secreto" --project="$PROJECT_ID" --replication-policy=automatic >/dev/null
    printf '  ✚  %-34s → %s (creado)\n' "$var" "$secreto"
  fi

  # El valor viaja por stdin, nunca como argumento.
  printf '%s' "$valor" | gcloud secrets versions add "$secreto" \
    --project="$PROJECT_ID" --data-file=- >/dev/null

  # Permiso de lectura para la SA del servicio (idempotente).
  gcloud secrets add-iam-policy-binding "$secreto" \
    --project="$PROJECT_ID" \
    --member="serviceAccount:${RUN_RUNTIME_SA}" \
    --role="roles/secretmanager.secretAccessor" >/dev/null
done

echo
if (( ${#faltantes[@]} > 0 )); then
  echo "Faltaron valores para: ${faltantes[*]}"
  echo "El servicio NO va a arrancar bien sin ellos. Complétalos y re-corre."
  exit 1
fi

echo "Listo: todos los secretos creados y con permiso de lectura."
echo
echo "Recuerda:"
echo "  · Borra $ENV_FILE cuando termines (tiene credenciales en claro)."
echo "  · Las credenciales de Google (token.json) son un secreto de ARCHIVO;"
echo "    se montan como volumen — ver deploy/cloud-run-service.yaml."
