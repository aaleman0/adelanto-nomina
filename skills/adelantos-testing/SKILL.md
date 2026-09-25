---
name: adelantos-testing
description: Planear, implementar y ejecutar pruebas unitarias (Vitest) y E2E (Playwright) del sistema de adelantos, confirmando importaciones, backoffice, endpoint de contratos, módulo WhatsApp, evidencia en Supabase, idempotencia y estados operativos.
---

# Adelantos Testing

## Lee primero

`docs/testing.md` — configuración, cobertura actual, huecos y comandos.

Los comandos están en `docs/testing.md`. Una sola nota al ejecutarlos: **usa `pnpm exec vitest run`, no `pnpm test`**, que corre en modo watch y deja el proceso colgado.

## Autenticación

Las pruebas E2E corren autenticadas mediante el proyecto `setup` de Playwright (`tests/e2e/auth.setup.ts`), que crea un usuario de prueba con rol `admin` y guarda el `storageState`. **No lo eludas** añadiendo excepciones al gate de `src/proxy.ts`: la protección es el comportamiento correcto.

Al probar el webhook de Meta, usa `postSignedWebhook` de `helpers/meta-signature.ts`: sin firma, el endpoint devuelve `401`.

## Tres advertencias que cambian cómo lees un resultado

1. **La suite corre contra `pnpm dev` con `retries: 1`.** El dev server compila cada ruta en el primer acceso; el reintento y los timeouts holgados absorben ese arranque en frío. No cambies a un build de producción: la suite `api` depende del comportamiento de desarrollo (`mock-sign` habilitado, webhook laxo sin secreto).

2. **Sin Supabase configurado, parte de la suite se salta en silencio.** **Antes de declarar que algo pasa, comprueba cuántos tests se ejecutaron**, no solo que no haya fallos.

3. **Los tests escriben en la base real.** No hay base de prueba separada. Nunca apuntes la suite a producción.

CI (`.github/workflows/ci.yml`) corre lint, tipos, tests unitarios, build, Gitleaks, `pnpm audit` y —si el repositorio tiene `SUPABASE_PROJECT_ID`— la comprobación de deriva de los tipos de base. **No corre E2E, y no es algo que vaya a resolverse solo:** haría falta un Supabase de prueba y las credenciales de Google montadas. Además `smoke` y `flows` están hoy rotas por otra razón: navegan a `/contracts`, `/imports`, `/settings/whatsapp` y `/whatsapp/*`, rutas que el backoffice reconstruido bajo `src/app/(operacion)/` ya no sirve. Un cambio puede pasar en verde con la suite E2E entera inservible.

## Cómo validar bien

Una prueba funcional debe confirmar **dos capas**: que la API responde lo esperado **y** que Supabase o el backoffice reflejan el estado resultante. Un test que solo mira el código HTTP no detecta que el estado no cambió.

Verifica idempotencia cuando aplique: repetir la solicitud del mismo contrato no debe crear una segunda solicitud activa ni un intento redundante.

## Compartimentos

- `smoke` — rápido, estable, **no crea datos**.
- `api` — endpoints aislados, sin abrir página.
- `flows` — recorridos completos que cruzan API, Supabase y backoffice; pueden crear datos.
- `helpers` — utilidades compartidas, **sin assertions de negocio**.

Mantén las pruebas E2E fuera de `src`. No mezcles pruebas lentas de flujo con smoke o API.

## Dónde falta cobertura

Los huecos más relevantes hoy, por si el trabajo justifica cerrarlos:

- **Testing Library y `msw` siguen sin usarse.** Hay un solo test de componente, `src/app/solicitar/[token]/page.test.tsx`, y no usa ninguna de las dos: llama al componente de servidor como función y serializa su árbol con `renderToStaticMarkup`. No hay nada probado con DOM real ni con peticiones interceptadas.
- **`src/lib/backoffice/` no tiene tests unitarios.** Los modelos de lectura y la traducción de filtros no están cubiertos, y ahí vive el vocabulario de estados operativos, `rechazado` incluido.
- **`src/lib/google/` y los route handlers tampoco.**

Los tests unitarios son hoy 40 archivos y 434 casos, y cubren bastante más que lo básico: la ventana para pedir (`ventana-oferta`, con las dos pruebas que impiden volver a derivarla del TTL del enlace de firma), la firma tardía, la solicitud previa, el chatbot entero y su paso por la ventana, el CSV de importación completo y las funciones de decisión de `apply.ts`, firmas de webhook de Meta y de EasyLex, rate limit, roles, cola, y el invariante de RLS (20 casos, apagados salvo `RUN_RLS_CHECK=1`).

## Reglas

- No imprimir `.env.local`, la service role key ni payloads sensibles completos.
- Usar RFCs de prueba o datos ya presentes en la base de desarrollo.
- Si una prueba se salta por falta de datos elegibles, **el reporte debe decirlo con claridad** — un falso verde es peor que un fallo.
- No borrar datos de Supabase como parte de las pruebas salvo instrucción explícita.
- No dejar servidores extra corriendo al terminar.
