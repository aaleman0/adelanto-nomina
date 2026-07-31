# Go-live: puesta en producción

Checklist **ordenado por dependencias** de todo lo que falta para que el sistema
esté en producción. Cada fase asume la anterior. Los pasos marcados 🧑 requieren
una persona (cuentas, credenciales, verificaciones de terceros): no se pueden
automatizar desde el repo.

El código está completo y verificado; lo que sigue es aprovisionamiento y
configuración. Detalle por tema en [Configuración](configuracion.md),
[Seguridad](seguridad.md) e [Infraestructura](infraestructura.md).

---

## Estado actual — resumen (act. 2026-07-30)

El **flujo completo está terminado y probado** en código (importar → WhatsApp →
contrato EasyLex → firma → webhook → entrega del PDF al empleado → backoffice).
Lo que falta es **aprovisionamiento y despliegue**.

**✅ Resuelto/verificado esta iteración**
- EasyLex autentica en producción (`api.easylex.com`); llaves y ambiente correctos.
- Firma pública correcta: `easylex.com/documento/firma/<signerId>` + plantilla `adelanto_contrato_listo` configurada.
- Validaciones de identidad (INE + foto + biométrico + prueba de vida) con la dependencia forzada.
- Webhook de firma robusto (secreto plano **o** HMAC), probado end-to-end.
- Entrega del contrato firmado: archiva + WhatsApp + descargar/reenviar en backoffice. Bucket + columna **migrados**.
- RLS aplicada y verificada.

**☐ Pendientes para go-live** (detalle en las fases de abajo)

*Datos — bloquean que el contrato salga completo:*
- [ ] **Datos personales de los empleados (el bloqueo grande).** Al 2026-07-31 solo **3/608** empleados tienen `estado_civil`, `nacionalidad`, `lugar_origen`, `fecha_nacimiento` y `domicilio`; al resto le faltan → generarían contratos con huecos. Requiere el CSV completo. Medir con `pnpm dlx tsx scripts/verify-contracts-batch.ts --audit-only`.
- [ ] Llenar en `company_settings` las **5 claves vacías**: `acreedor_banco`, `acreedor_cuenta`, `acreedor_clabe`, `testigo_1_nombre`, `testigo_2_nombre` (desde "Datos de empresa"). La identidad del acreedor (`acreedor_razon_social/representante/rfc/domicilio`) **ya es editable y tiene respaldo** — no bloquea.
- [ ] Montar credenciales de Google (`google_oauth_client.json` + `token.json`) en el contenedor — sin ellas no se genera ningún contrato.

> **Hechos 2026-07-31:** bug de formato del monto en la plantilla **corregido**; identidad del acreedor **convertida a placeholders editables** con respaldo. Verificación con `scripts/verify-contracts-batch.ts` (veredicto `LIMPIO`). Detalle en [EasyLex y contratos](easylex-contratos.md#plantilla-del-contrato-placeholders-y-arreglos).

*WhatsApp:*
- [ ] Token **permanente** (System User); el temporal caduca sin aviso.
- [ ] `WHATSAPP_APP_SECRET` (firma del webhook de Meta) — hoy ausente.
- [ ] Verificación del negocio en Meta (si se enviará a números fríos / marketing).

*Deploy:*
- [ ] Desplegar a Cloud Run (URL pública) + `NEXT_PUBLIC_APP_URL` con el dominio real.
- [ ] Variables de prod en el entorno (no en `.env.local`): `EASYLEX_BASE_URL=https://api.easylex.com`, `EASYLEX_SIGNING_LINK_BASE_URL=https://easylex.com/documento/firma`, y las llaves de EasyLex/WhatsApp/Supabase.

*Webhooks (ya con URL pública):*
- [ ] Meta → `https://<dominio>/api/webhooks/whatsapp` (+ verify token).
- [ ] EasyLex → `https://<dominio>/api/webhooks/easylex/sign`: `EASYLEX_CALLBACK_URL` + `EASYLEX_WEBHOOK_SECRET` en prod **y** el mismo secreto en el dashboard de EasyLex. Confirmar con ellos el esquema de firma.

*Endurecimiento final (flips, con todo estable):*
- [ ] `RBAC_ENFORCEMENT=enforce`, `RLS_SESSION_READS=on` (confirmar M1 `20260723` aplicada primero), `WEBHOOK_ENFORCE_SIGNATURES=true`, CSP report-only → enforce; `pnpm verify:rls` post-deploy.

*Prueba final:*
- [ ] Firmar un contrato **real** en producción → el expediente pasa a **Firmado** y el empleado **recibe su PDF** por WhatsApp. Runbook paso a paso: [Primera prueba end-to-end](primera-prueba-e2e.md).

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
- [x] **EasyLex ya autentica (resuelto).** El `code 106` era discordancia de
      ambiente+llave, no un bloqueo de soporte. Solo queda fijar en prod
      `EASYLEX_BASE_URL=https://api.easylex.com` + las llaves correctas, y
      confirmar con EasyLex el esquema de firma del webhook. Ver
      [EasyLex y contratos](easylex-contratos.md#autenticación).

## Fase 1 — Base de datos

- [ ] 🧑 **Aplicar las migraciones pendientes** en el SQL Editor de Supabase, en orden:
      `20260723_restrict_sensitive_reads.sql` (restringe CLABE/PII a `operaciones`+),
      `20260724_whatsapp_message_dedup.sql` (dedup de envíos),
      `20260730_signed_contracts.sql` (bucket `contratos-firmados` + `signed_pdf_path`),
      `20260731_bulk_send_mode_status.sql` (arregla el CHECK de `whatsapp_bulk_sends.mode`,
      que hoy hace fallar con 500 el envío en lote por etapa). En una base nueva, aplicar
      **todas** las de `supabase/migrations/` en orden.
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
- [ ] 🧑 **Cableado del webhook de EasyLex:** `EASYLEX_CALLBACK_URL` (URL pública que
      termina en `/api/webhooks/easylex/sign`) + `EASYLEX_WEBHOOK_SECRET` en el entorno,
      y el **mismo secreto** configurado en el dashboard de EasyLex. Confirmar con EasyLex
      su esquema de firma y nombres de evento (`DOCUMENT_SIGNED`/`SIGNED_BY_USER`); el
      handler ya acepta secreto plano **o** HMAC, así que no hay cambio de código. La app
      manda el `callbackUrl` por documento. Probar firmando un contrato real → el
      expediente pasa a **Firmado**. Config de EasyLex: [EasyLex y contratos](easylex-contratos.md).
- [ ] 🧑 **Firma en producción:** `EASYLEX_BASE_URL=https://api.easylex.com` y
      `EASYLEX_SIGNING_LINK_BASE_URL=https://easylex.com/documento/firma` (los defaults
      apuntan a sandbox/dominios muertos). Botón de la plantilla `adelanto_contrato_listo`
      con base `https://easylex.com/documento/firma/` + `{{1}}`.
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
