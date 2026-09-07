# Pasos para poner esto en producción

Lista simple y en orden de lo que hay que hacer **a mano**. Todo lo que se podía
automatizar ya está hecho: el workflow de despliegue, el script de secretos y la
configuración del servicio.

El detalle largo de cada fase está en [go-live.md](go-live.md); esto es la ruta.

---

## Antes de empezar, ten a la mano

- Cuenta de Google Cloud con **facturación activa**.
- El dominio que va a usar el sistema (o decide usar la URL que da Cloud Run).
- Acceso de administrador al repo de GitHub.
- Las credenciales de producción: Supabase, WhatsApp (Meta) y EasyLex.

---

## 1 · Google Cloud: crear la casa

1. Crear el **proyecto** de GCP (uno para producción).
2. Activar las APIs: Cloud Run, Artifact Registry, Secret Manager, Cloud Tasks.
3. Crear el **repositorio de Artifact Registry** (tipo Docker) — ahí viven las imágenes.
4. Crear **3 cuentas de servicio**:
   - la del **servicio** (con la que corre la app),
   - la de **despliegue** (la que usa GitHub),
   - la **invocadora** de Cloud Tasks (la crea sola el script del paso 3).

## 2 · Conectar GitHub con Google Cloud (sin llaves)

5. Configurar **Workload Identity Federation**: un pool, un proveedor y el permiso
   para tu repo. Es lo que deja que GitHub despliegue sin guardar ninguna llave.
6. En GitHub → *Settings → Environments* → crear `production` y ponerle estas
   **variables** (Variables, no Secrets):

   | Variable | Ejemplo |
   |---|---|
   | `GCP_PROJECT_ID` | `adelantos-prod` |
   | `GCP_REGION` | `us-central1` |
   | `GCP_WIF_PROVIDER` | `projects/123.../providers/github` |
   | `GCP_DEPLOY_SA` | `deploy@adelantos-prod.iam.gserviceaccount.com` |
   | `ARTIFACT_REGISTRY_REPO` | `adelantos` |
   | `CLOUD_RUN_SERVICE` | `adelantos-admin` |
   | `NEXT_PUBLIC_APP_URL` | `https://tu-dominio.com` |

7. Proteger el entorno `production` con *required reviewers* (que un despliegue
   necesite aprobación).

## 3 · Cargar las credenciales

8. Copiar el entorno local a uno de producción y **poner los valores reales**:
   ```bash
   cp .env.local .env.produccion   # y edita: llaves de prod, no las de prueba
   ```
9. Crear los secretos en Google:
   ```bash
   GCP_PROJECT_ID=tu-proyecto \
   RUN_RUNTIME_SA=adelantos-admin-run@tu-proyecto.iam.gserviceaccount.com \
     bash scripts/crear-secretos.sh .env.produccion
   ```
   El script avisa si falta algún valor y **no** deja pasar uno vacío.
10. **Borrar `.env.produccion`** cuando termine.
11. Crear la cola de Cloud Tasks:
    ```bash
    GCP_PROJECT_ID=… RUN_RUNTIME_SA=… bash scripts/setup-cloud-tasks.sh
    ```

## 4 · Primer despliegue

12. Rellenar los marcadores de `deploy/cloud-run-service.yaml`: `PROJECT_ID`,
    `REGION`, `REPO`, `TU-DOMINIO`, `ALLOWED_EMAILS` (los correos de quienes van a
    entrar) y los identificadores de WhatsApp.
13. Crear el servicio:
    ```bash
    gcloud run services replace deploy/cloud-run-service.yaml --region=REGION
    ```
14. Apuntar el **dominio** a Cloud Run (DNS). Si prefieres arrancar con la URL que
    da Cloud Run, úsala y ajusta las variables del paso 6.
15. Hacer merge a `main` → el despliegue corre solo. También puedes lanzarlo a mano
    desde la pestaña **Actions → Deploy**.

## 5 · Conectar Meta y EasyLex

16. **Webhook de Meta** → `https://tu-dominio/api/webhooks/whatsapp`, con el verify
    token, y **suscribir el campo `messages`**.
    ⚠️ Sin ese último clic, el chatbot no se entera cuando alguien toca un botón.
17. **Webhook de EasyLex** → `https://tu-dominio/api/webhooks/easylex/sign`, con el
    mismo secreto que pusiste en `EASYLEX_WEBHOOK_SECRET`.
18. En el sistema: **Ajustes → Plantillas → Sincronizar con Meta** (con la plantilla
    ya aprobada).

## 6 · Probar antes de soltarlo

19. Entrar con tu cuenta y confirmar que solo entran los correos autorizados.
20. Enviar la oferta a **un solo empleado de prueba** y recorrer el flujo completo:
    llega el mensaje → "Sí, lo quiero" → llega el enlace → firmar dentro de 2 horas.
21. Revisar en los logs que aparece `queue.driver.selected { kind: 'cloud-tasks' }`
    (que el envío se está drenando por la cola y no en línea).

## 7 · Endurecer (ya con todo estable)

22. `RBAC_ENFORCEMENT=enforce` — **después** de asignarle su rol a cada operador.
23. `RLS_SESSION_READS=on` — **después** de aplicar las migraciones.
24. Alertas en Cloud Monitoring.

---

## Lo que ya está hecho (no tienes que tocarlo)

- ✅ `.github/workflows/deploy.yml` — construye, publica y despliega, con lint,
  tipos y pruebas como puerta de entrada, y una comprobación de que el servicio
  responde después.
- ✅ `scripts/crear-secretos.sh` — crea los 9 secretos y da permisos.
- ✅ `scripts/setup-cloud-tasks.sh` — crea la cola y la cuenta invocadora.
- ✅ `deploy/cloud-run-service.yaml` — el servicio con sus 31 variables declaradas.
- ✅ `Dockerfile` — imagen verificada: construye (290 MB) y arranca.
