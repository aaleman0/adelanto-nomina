# Go-live: puesta en producción

Checklist **ordenado por dependencias** de todo lo que falta para que el sistema
esté en producción. Cada fase asume la anterior. Los pasos marcados 🧑 requieren
una persona (cuentas, credenciales, verificaciones de terceros): no se pueden
automatizar desde el repo.

El código está completo y verificado; lo que sigue es aprovisionamiento y
configuración. Detalle por tema en [Configuración](configuracion.md),
[Seguridad](seguridad.md) e [Infraestructura](infraestructura.md).

---

## Fase 0 — Desbloqueos externos (empezar YA, dependen de terceros)

Van primero porque tienen tiempos de espera ajenos.

- [ ] 🧑 **Credenciales de Google.** Sin ellas **no se genera ningún contrato**.
      Descarga el OAuth client (tipo *Desktop*) de Google Cloud Console como
      `google_oauth_client.json`, activa las APIs de Drive y Docs, y corre
      `pnpm dlx tsx scripts/google-auth.ts` con la cuenta **dueña de la plantilla**
      para generar `token.json`.
- [ ] 🧑 **Verificación del negocio en Meta.** Mientras `business_verification_status`
      siga en `pending_submission`, las plantillas **MARKETING no se entregan a
      contactos fríos**. También sube el *tier* de mensajería, necesario para
      lotes de miles. Ver [WhatsApp](whatsapp.md#categoría-de-plantilla-y-entrega-importante).
- [ ] 🧑 **Desbloqueo de EasyLex.** Su API rechaza las llaves (`code 106`); soporte
      debe habilitar el acceso. Sin esto el link de firma no funciona.

## Fase 1 — Base de datos

- [ ] 🧑 **Aplicar `supabase/migrations/20260723_restrict_sensitive_reads.sql`** en el
      SQL Editor de Supabase (restringe CLABE y PII cruda a `operaciones`+).
- [ ] **Verificar RLS:** `set -a; . ./.env.local; set +a; pnpm verify:rls` → 18 tablas
      + 2 vistas a 0 filas con la anon key.
- [ ] 🧑 Completar las **5 claves `(LLENAR)` de `company_settings`** (datos de la
      empresa que salen impresos en el contrato).
- [ ] 🧑 Borrar de `settings` las filas antiguas con secretos en texto plano.
- [ ] 🧑 Activar **Point-in-Time Recovery** en Supabase (crítico: miles de registros PII).

## Fase 2 — Aprovisionar GCP

- [ ] 🧑 Proyecto de GCP con billing activo (uno por entorno: prod y staging).
- [ ] 🧑 **Artifact Registry**: repositorio Docker para las imágenes.
- [ ] 🧑 **Service accounts** (mínimo privilegio):
      - del **servicio** Cloud Run (runtime) — necesita `cloudtasks.enqueuer`,
        `secretmanager.secretAccessor` y `actAs` sobre la invoker;
      - de **deploy** (la que usa CI) — `run.admin`, `artifactregistry.writer`,
        `iam.serviceAccountUser`;
      - **invoker** de Cloud Tasks (la crea el script de abajo).
- [ ] 🧑 **Secret Manager**: crear un secreto por credencial (Supabase, WhatsApp,
      EasyLex, y `token.json` de Google como secreto de archivo).
- [ ] **Cloud Tasks**: `GCP_PROJECT_ID=… RUN_RUNTIME_SA=… bash scripts/setup-cloud-tasks.sh`
- [ ] 🧑 **Workload Identity Federation**: pool + provider + binding para el repo de
      GitHub (deploy sin llaves).

## Fase 3 — Primer despliegue

- [x] **Smoke test local de la imagen** — ✅ **verificado** (2026-07-23): build OK
      (308 MB), `/api/health` 200, `/login` 200, `/` 307 a login, cabeceras de
      seguridad presentes, proceso como **no-root** (`uid=1000 node`).
      ```bash
      docker build --build-arg NEXT_PUBLIC_APP_URL=https://tu-dominio.com -t adelantos-admin:test .
      docker run --rm -p 8099:8080 --env-file .env.local adelantos-admin:test
      ```
      ⚠️ **Arquitectura:** en un Mac con Apple Silicon la imagen sale **arm64**, y
      **Cloud Run sólo corre linux/amd64**. El job de CI construye en runners amd64,
      así que el despliegue automático está bien; si alguna vez subes una imagen a
      mano desde el Mac, usa `docker build --platform linux/amd64 …`.
- [ ] Rellenar los marcadores de **`deploy/cloud-run-service.yaml`** (`PROJECT_ID`,
      `REGION`, `REPO`, `TU-DOMINIO`, `ALLOWED_EMAILS` con las personas autorizadas).
- [ ] Crear el servicio: `gcloud run services replace deploy/cloud-run-service.yaml --region=REGION`
- [ ] 🧑 **Dominio personalizado** apuntando a Cloud Run (DNS).
- [ ] Ajustar al dominio real: `NEXT_PUBLIC_APP_URL`, `TASKS_WORKER_BASE_URL`,
      `EASYLEX_CALLBACK_URL`. ⚠️ `NEXT_PUBLIC_APP_URL` **se inlinea en build**: va
      como build-arg, no basta cambiarlo en runtime.

## Fase 4 — Entrega continua

- [ ] 🧑 Variables por entorno en GitHub (Settings → Environments → `production` /
      `staging`): `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA`, `GCP_PROJECT_ID`, `GCP_REGION`,
      `ARTIFACT_REGISTRY_REPO`, `CLOUD_RUN_SERVICE`, `NEXT_PUBLIC_APP_URL`.
- [ ] 🧑 Proteger el entorno `production` con *required reviewers*.
- [ ] 🧑 **Mergear el PR #3** → dispara el primer deploy automático.

## Fase 5 — Webhooks y verificación

- [ ] 🧑 Webhook de **Meta** → `https://tu-dominio/api/webhooks/whatsapp` (con el
      verify token) y webhook de **EasyLex** → `https://tu-dominio/api/webhooks/easylex/sign`.
- [ ] Post-deploy: correr `pnpm verify:rls` contra producción.
- [ ] Probar el login: solo las cuentas de `ALLOWED_EMAILS` deben entrar.
- [ ] Enviar un mensaje de prueba y confirmar en logs `queue.driver.selected { kind: 'cloud-tasks' }`.
- [ ] 🧑 Alertas en Cloud Monitoring (ver [Infraestructura](infraestructura.md#cloud-monitoring-y-logging)).

## Fase 6 — Endurecimiento final (flips, ya con todo estable)

Son cambios de configuración, el código ya los soporta:

- [ ] `RBAC_ENFORCEMENT=enforce` — **después** de promover los roles de cada operador.
- [ ] `RLS_SESSION_READS=on` — **después** de aplicar la migración de la Fase 1.
- [ ] CSP: `Content-Security-Policy-Report-Only` → `Content-Security-Policy` en
      `next.config.ts`, tras verificar que la consola no reporta violaciones.
- [ ] `TRUSTED_PROXY_COUNT` según la topología real (1 = Cloud Run directo).
