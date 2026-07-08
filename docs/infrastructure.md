# Infraestructura de Producción

## Opción elegida

Docker + Google Cloud Run + GitHub Actions + Artifact Registry + Cloud Monitoring.

Esta opción fue elegida como el equilibrio entre profesionalismo, control operativo y simplicidad. Permite contenerizar la aplicación Next.js, desplegarla en un entorno serverless gestionado, automatizar el pipeline de CI/CD y tener observabilidad sin administrar servidores ni Kubernetes.

---

## Arquitectura general

```
┌─────────────────┐
│   GitHub Repo   │
│  (este proyecto)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ GitHub Actions  │────▶│ Docker Registry │
│   (CI/CD)       │     │ (Artifact       │
│                 │     │  Registry)      │
└─────────────────┘     └────────┬────────┘
                               │
                               ▼
                      ┌─────────────────┐
                      │  Google Cloud   │
                      │      Run        │
                      │  (Next.js app)  │
                      └────────┬────────┘
                               │
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
     ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
     │  Supabase   │    │  Meta API   │    │  EasyLex    │
     │   (BD)      │    │  (WhatsApp) │    │  (contratos)│
     └─────────────┘    └─────────────┘    └─────────────┘
```

---

## Componentes

### 1. Docker

La aplicación se empaqueta en una imagen Docker con un Dockerfile multi-stage.

- Build stage: compila la aplicación Next.js con `pnpm build`.
- Runtime stage: imagen ligera basada en Node.js (alpine o distroless) que expone el puerto 3000 y ejecuta `next start`.
- No se incluyen secretos en la imagen. Las variables de entorno se inyectan en runtime.

### 2. Google Cloud Run

Servicio de contenedores serverless que ejecuta la imagen Docker.

- Escalado automático basado en tráfico.
- HTTPS y certificado TLS gestionados automáticamente.
- Soporte para dominios personalizados.
- Health checks integrados que usan el endpoint `/api/health` existente.
- Timeout, concurrencia y límites de CPU/memoria configurables.
- Rollback a revisiones anteriores desde la consola de GCP.

### 3. Artifact Registry

Registro privado de imágenes Docker dentro de Google Cloud.

- Almacena cada versión de la imagen etiquetada con el hash del commit o el tag de Git.
- Integrado con IAM para control de acceso.
- Cloud Run obtiene la imagen directamente desde este registro.

### 4. GitHub Actions

Pipeline de CI/CD automatizado.

- Pull requests: ejecuta lint, typecheck y tests.
- Merge a `main`: construye la imagen Docker, la sube a Artifact Registry y despliega en Cloud Run.
- Merge a `develop`: despliega automáticamente a un entorno de staging.
- Posibilidad de rollback manual a una revisión anterior de Cloud Run.

### 5. Cloud Monitoring y Cloud Logging

- Logs centralizados de todos los requests, errores y eventos de la aplicación.
- Métricas de latencia, tráfico, errores y utilización de recursos.
- Alertas configuradas para:
  - Caídas del servicio.
  - Tasa de error superior al umbral definido.
  - Latencia p95 elevada.

---

## Flujo de CI/CD

1. El desarrollador abre un pull request.
2. GitHub Actions ejecuta lint, TypeScript y tests.
3. Al aprobarse y mergearse a `main`, GitHub Actions:
   - Construye la imagen Docker.
   - Etiqueta la imagen con el SHA del commit.
   - Sube la imagen a Artifact Registry.
   - Despliega la nueva revisión en Cloud Run.
4. Cloud Run ejecuta health checks y reemplaza la revisión anterior si todo está sano.
5. Si el deploy falla, se puede revertir a la revisión anterior desde la consola o mediante el pipeline.

---

## Gestión de secretos y variables de entorno

- Los secretos (tokens de WhatsApp, claves de Supabase, claves de EasyLex) se almacenan en Google Cloud Secret Manager.
- Cloud Run inyecta los secretos como variables de entorno en runtime.
- No se incluyen secretos en el repositorio ni en la imagen Docker.
- Las variables no sensibles se configuran directamente en el servicio de Cloud Run.

---

## Webhooks y dominio público

- El dominio de producción apunta al servicio de Cloud Run.
- El webhook de Meta (`/api/webhooks/whatsapp`) se configura con la URL pública del dominio.
- El callback de EasyLex (`/api/webhooks/easylex/sign`) se configura con la URL pública del dominio.
- En desarrollo local se continúa usando ngrok para recibir webhooks externos.

---

## Ventajas de esta opción

- Control total sobre el entorno de ejecución.
- Portabilidad: la imagen Docker puede correr en cualquier cloud o localmente.
- Consistencia entre ambientes (dev, staging, prod).
- Rollback rápido por imagen anterior.
- Escalado automático sin administrar servidores.
- CI/CD automatizado y reproducible.
- Observabilidad integrada con logs y métricas.
- Sin la complejidad de Kubernetes.

---

## Consideraciones

- El equipo debe conocer los conceptos básicos de Docker y GCP.
- Es recomendable tener un entorno de staging separado para validar cambios antes de producción.
- Cloud Run tiene límites de timeout y tamaño de request que deben revisarse si se generan PDFs grandes o se reciben payloads grandes.
- Los costos de Cloud Run dependen del tráfico, la concurrencia y el tiempo de CPU. Para un backoffice interno suele ser económico.

---

## Alternativas descartadas

- **Vercel**: más simple, pero menos control sobre el runtime y la imagen del contenedor.
- **AWS ECS Fargate**: más control granular, pero añade complejidad de ALB, VPC e IAM para un proyecto de este tamaño.
- **Kubernetes**: excesivo para un monolito Next.js con una base de datos gestionada. Añade operación de clusters, ingress, cert-manager y monitoreo propio.

---

## Próximos pasos para implementar

1. Crear un Dockerfile multi-stage optimizado para Next.js.
2. Configurar el proyecto en Google Cloud Platform.
3. Crear el repositorio en Artifact Registry.
4. Crear el servicio de Cloud Run con las variables de entorno iniciales.
5. Configurar Cloud Secret Manager para los secretos.
6. Crear los workflows de GitHub Actions para CI/CD.
7. Configurar el dominio personalizado y los webhooks de Meta/EasyLex.
8. Definir alertas en Cloud Monitoring.
