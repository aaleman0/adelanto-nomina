---
name: adelantos-testing
description: Planear, implementar y ejecutar pruebas unitarias (Vitest) y E2E (Playwright) del sistema de adelantos, confirmando importaciones, backoffice de control, endpoint de contratos, modulo WhatsApp, evidencia en Supabase, idempotencia y estados operativos antes de avanzar fases.
---

# Adelantos Testing

## Proposito

Usar esta skill para validar que cada fase del sistema funciona de punta a punta antes de seguir construyendo. Las pruebas deben confirmar comportamiento observable en API, Supabase y backoffice, sin exponer secretos ni datos sensibles.

## Herramientas

- **Vitest**: pruebas unitarias para logica de negocio (`src/lib/`). Configurado en `vitest.config.ts`.
- **Playwright**: pruebas E2E para flujos de UI y API contra servidor local.

## Flujo De Validacion

1. Ejecutar validaciones estaticas: `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`.
2. Ejecutar unit tests con Vitest: `pnpm test`.
3. Elegir el compartimento de pruebas E2E segun el riesgo: `smoke`, `api`, `flows` o `all`.
4. Ejecutar pruebas Playwright contra servidor local usando `webServer`.
5. Probar endpoints con datos controlados y respuestas esperadas.
6. Confirmar que el backoffice muestra los cambios relevantes cuando sea una prueba de flujo.
7. Verificar idempotencia: repetir la accion no debe duplicar contratos activos.
8. Reportar resultados con evidencia concreta: comandos, rutas probadas y estados esperados.

## Compartimentos E2E

- `smoke`: pruebas rapidas de carga visual y estructura basica del backoffice.
- `api`: pruebas de endpoints aislados que no necesitan confirmar UI.
- `flows`: pruebas completas que cruzan API, Supabase y backoffice.
- `whatsapp`: pruebas especificas del modulo WhatsApp (dashboard, historial, envio masivo).
- `all`: corrida completa solo antes de cerrar una fase o preparar entrega.

## Cobertura Minima

### Contratos

- Backoffice carga y muestra `Control de contratos`.
- `POST /api/manychat/request-contract` rechaza payload invalido.
- El endpoint responde `not_found` para RFC inexistente.
- Con un RFC elegible real, genera o reutiliza un link mock por 2 horas.
- La vista de control refleja `contrato_generado`, `link_expirado`, `firmado` o `error` segun aplique.
- Repetir la solicitud para la misma oferta reutiliza el link vigente o la solicitud existente.

### WhatsApp

- Dashboard `/whatsapp` carga con stats y sin errores.
- Formulario de envio `/whatsapp/send` valida elegibilidad antes de enviar.
- Historial `/whatsapp/history` muestra lista paginada de envios.
- Health check `/api/health/whatsapp` responde con estado de configuracion.
- Validacion de elegibilidad (`POST /api/whatsapp/bulk?action=validate`) retorna conteo correcto.

### Unit Tests (Vitest)

- `src/lib/whatsapp/eligibility.test.ts`: reglas de elegibilidad para envio masivo.
- `src/lib/contracts/request-contract.test.ts`: logica de solicitud, idempotencia y estados.

## Reglas

- No imprimir `.env.local`, service role key ni payloads sensibles completos.
- Usar RFCs de prueba o datos ya presentes en la BD local/Supabase del proyecto.
- Si no hay empleado elegible, la prueba E2E debe saltar con explicacion, no fallar con falso negativo.
- No borrar datos de Supabase como parte de las pruebas salvo instruccion explicita.
- Las pruebas deben ser repetibles y seguras para entorno de desarrollo.
- Mantener pruebas E2E fuera de `src`; usar `tests/e2e/<compartimento>`.
- No mezclar pruebas lentas de flujo completo con pruebas smoke/API.

## Referencias

Leer `references/playwright-e2e.md` antes de crear o modificar pruebas Playwright.
