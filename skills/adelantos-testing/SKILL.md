---
name: adelantos-testing
description: Planear, implementar y ejecutar pruebas funcionales, API y E2E del sistema de adelantos con Playwright, confirmando importaciones, backoffice de control, endpoint ManyChat mock, evidencia en Supabase, idempotencia y estados operativos antes de avanzar fases.
---

# Adelantos Testing

## Proposito

Usar esta skill para validar que cada fase del sistema funciona de punta a punta antes de seguir construyendo. Las pruebas deben confirmar comportamiento observable en API, Supabase y backoffice, sin exponer secretos ni datos sensibles.

## Flujo De Validacion

1. Ejecutar validaciones estaticas: `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`.
2. Elegir el compartimento de pruebas segun el riesgo: `smoke`, `api`, `flows` o `all`.
3. Ejecutar pruebas Playwright contra servidor local usando `webServer`.
4. Probar endpoints con datos controlados y respuestas esperadas.
5. Confirmar que el backoffice muestra los cambios relevantes cuando sea una prueba de flujo.
6. Verificar idempotencia: repetir la accion no debe duplicar contratos activos.
7. Reportar resultados con evidencia concreta: comandos, rutas probadas y estados esperados.

## Compartimentos

- `smoke`: pruebas rapidas de carga visual y estructura basica del backoffice.
- `api`: pruebas de endpoints aislados que no necesitan confirmar UI.
- `flows`: pruebas completas que cruzan API, Supabase y backoffice.
- `all`: corrida completa solo antes de cerrar una fase o preparar entrega.

## Cobertura Minima

- Backoffice carga y muestra `Control de contratos`.
- Importaciones siguen visibles como seccion secundaria.
- `POST /api/manychat/request-contract` rechaza payload invalido.
- El endpoint responde `not_found` para RFC inexistente.
- Con un RFC elegible real, genera o reutiliza un link mock por 2 horas.
- La vista de control refleja `contrato_generado`, `link_expirado`, `firmado` o `error` segun aplique.
- Repetir la solicitud para la misma oferta reutiliza el link vigente o la solicitud existente.

## Reglas

- No imprimir `.env.local`, service role key ni payloads sensibles completos.
- Usar RFCs de prueba o datos ya presentes en la BD local/Supabase del proyecto.
- Si no hay empleado elegible, la prueba E2E debe saltar con explicacion, no fallar con falso negativo.
- No borrar datos de Supabase como parte de las pruebas salvo instruccion explicita.
- Las pruebas deben ser repetibles y seguras para entorno de desarrollo.
- Mantener pruebas fuera de `src`; usar `tests/e2e/<compartimento>`.
- No mezclar pruebas lentas de flujo completo con pruebas smoke/API.

## Referencias

Leer `references/playwright-e2e.md` antes de crear o modificar pruebas Playwright.
