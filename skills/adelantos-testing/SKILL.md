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

1. **`flows` prueba una UI que ya no existe.** 37 de sus 45 tests describen el formulario de envío anterior. Sus fallos no dicen nada sobre el código actual; están pendientes de reescribir contra el asistente de 5 pasos.

2. **Sin Supabase configurado, parte de la suite se salta en silencio.** **Antes de declarar que algo pasa, comprueba cuántos tests se ejecutaron**, no solo que no haya fallos.

3. **Los tests escriben en la base real.** No hay base de prueba separada. Nunca apuntes la suite a producción.

CI (`.github/workflows/ci.yml`) corre lint, tipos, tests unitarios, build, Gitleaks y `pnpm audit`. **No corre E2E** hasta que `flows` esté reescrita.

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

- **No hay ni un test de componente**, pese a que jsdom, Testing Library y `msw` están instalados.
- **`src/lib/imports/` no tiene tests unitarios.** Normalización, duplicados y versionado de ofertas concentran reglas de negocio y solo se validan indirectamente por E2E.
- **`src/lib/backoffice/` tampoco.** Los modelos de lectura y la traducción de filtros no están cubiertos.

Los tests unitarios existentes cubren elegibilidad, parseo del payload de contrato, normalización de teléfonos y monto en letra.

## Reglas

- No imprimir `.env.local`, la service role key ni payloads sensibles completos.
- Usar RFCs de prueba o datos ya presentes en la base de desarrollo.
- Si una prueba se salta por falta de datos elegibles, **el reporte debe decirlo con claridad** — un falso verde es peor que un fallo.
- No borrar datos de Supabase como parte de las pruebas salvo instrucción explícita.
- No dejar servidores extra corriendo al terminar.
