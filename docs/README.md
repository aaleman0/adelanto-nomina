# Documentación

Cada tema tiene **un solo documento**. Si un dato aparece en dos sitios, uno de los dos está mal: corregir el documento propietario y enlazarlo desde el otro.

| Documento | Propietario de |
|---|---|
| [Arquitectura](arquitectura.md) | Componentes, flujo completo, decisiones de diseño, estado del proyecto, riesgos |
| [Base de datos](base-de-datos.md) | Enums, tablas, índices, vistas, triggers, Storage, migraciones |
| [API](api.md) | Todos los endpoints, autenticación, contratos de entrada y salida |
| [Frontend](frontend.md) | Rutas, componentes, sistema de diseño, tokens, estado en cliente |
| [Importación CSV](importacion-csv.md) | Columnas, validación, normalización, elegibilidad, reimportación |
| [WhatsApp](whatsapp.md) | Configuración, plantillas, envío masivo, webhook, operación diaria |
| [EasyLex y contratos](easylex-contratos.md) | Reglas del contrato, PDF, cliente de EasyLex, firma |
| [Seguridad](seguridad.md) | Los cinco pilares (auth, RBAC, rate limiting, RLS, validación), casos comunes y plan de endurecimiento |
| [Configuración](configuracion.md) | Variables de entorno, `settings`, `company_settings`, checklist de producción |
| [Testing](testing.md) | Vitest, Playwright, comandos, cobertura y huecos |
| [Scripts](scripts.md) | Utilidades de `scripts/` |
| [Infraestructura](infraestructura.md) | Despliegue: Docker, Cloud Run, CI/CD, Cloud Tasks |
| [Go-live](go-live.md) | Checklist ordenado de puesta en producción — **empieza aquí para desplegar** |

## Por dónde empezar

**Es tu primer contacto con el proyecto** → [Arquitectura](arquitectura.md), y luego [Base de datos](base-de-datos.md).

**Vas a tocar un endpoint** → [API](api.md). La entrada se valida con Zod en el borde (`parseJsonBody`/`parseQuery`); ver también [Seguridad](seguridad.md#5-validación-server-side).

**Te importa la seguridad** → [Seguridad](seguridad.md): los cinco pilares con sus casos comunes y el [plan de endurecimiento](seguridad.md#plan-de-endurecimiento).

**Vas a tocar la UI** → [Frontend](frontend.md), sección de tokens antes de escribir CSS.

**Vas a operar envíos** → [WhatsApp](whatsapp.md).

**Vas a desplegar** → [Configuración](configuracion.md), en particular el checklist, y después [Infraestructura](infraestructura.md).

## Advertencias transversales

Tres hechos que afectan a casi cualquier trabajo sobre este código:

1. **RBAC no bloquea por defecto.** Los roles se comprueban con `requireRole()` y se registran, pero solo devuelven `403` con `RBAC_ENFORCEMENT=enforce`. Hasta activarlo, la autorización efectiva sigue siendo "hay sesión o no". → [Configuración](configuracion.md#roles-y-permisos-rbac)
2. **El envío masivo corre dentro del request HTTP**, sin cola. Es el límite de escalado más importante. → [WhatsApp](whatsapp.md#envío-masivo)
3. **EasyLex apunta a sandbox por defecto.** Dos variables lo determinan. → [Configuración](configuracion.md#easylex)

## Sobre `skills/`

Los archivos de `skills/` son guías de trabajo para agentes de IA: describen **cómo abordar** una tarea en cada área. La descripción de *qué existe* vive aquí, en `docs/`. Las skills enlazan a estos documentos en lugar de repetirlos.
