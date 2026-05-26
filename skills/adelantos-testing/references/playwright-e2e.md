# Playwright E2E

## Estructura Recomendada

- `playwright.config.ts`: configuracion del servidor local y navegador.
- `tests/e2e/smoke`: carga visual y secciones clave.
- `tests/e2e/api`: endpoints aislados y respuestas esperadas.
- `tests/e2e/flows`: recorridos completos que cruzan API, Supabase y backoffice.
- `tests/e2e/whatsapp`: pruebas especificas del modulo WhatsApp.
- `tests/e2e/helpers/supabase.ts`: helpers para encontrar datos elegibles sin imprimir secretos.

## Separacion Por Tipo

- Smoke: debe ser rapido, estable y no crear datos.
- API: puede llamar endpoints, pero no necesita abrir pagina.
- Flows: puede crear o reutilizar datos de prueba y confirmar backoffice.
- WhatsApp: pruebas del dashboard, historial, envio masivo y configuracion.
- Helpers: no deben contener assertions de negocio; solo utilidades compartidas.

## Confirmaciones

Una prueba funcional completa debe validar al menos dos capas:

- API devuelve respuesta esperada.
- Supabase/backoffice refleja el estado resultante.

### Para contrato mock:

1. Buscar una oferta vigente elegible en `backoffice_contract_control_v1`.
2. Enviar `POST /api/manychat/request-contract`.
3. Esperar `status = contract_ready` o `already_signed`.
4. Recargar backoffice.
5. Confirmar que el RFC aparece y el estado operativo ya no queda como `pendiente_envio` cuando el contrato se genero.

### Para modulo WhatsApp:

1. Navegar a `/whatsapp` y confirmar que el dashboard carga sin errores.
2. Navegar a `/whatsapp/send` y confirmar que el formulario de envio es visible.
3. Navegar a `/whatsapp/history` y confirmar que la lista de historial carga.
4. Llamar `POST /api/whatsapp/bulk?action=validate` con modo `import` o `manual` y confirmar respuesta con `eligible`.
5. Llamar `GET /api/health/whatsapp` y confirmar que el campo `configured` esta presente.

## Comandos

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm test
pnpm build
pnpm test:e2e:smoke
pnpm test:e2e:api
pnpm test:e2e:flows
pnpm exec playwright test tests/e2e/whatsapp
pnpm test:e2e
```

## Criterio De Exito

- Todas las pruebas automatizadas pasan.
- Los unit tests de Vitest pasan sin errores.
- Si una prueba se salta por falta de datos elegibles, el reporte debe decirlo claramente.
- No quedan servidores extras corriendo salvo que el usuario los pida.
