# Base de datos

Fuente única del modelo de datos. Postgres gestionado por Supabase.

Las migraciones viven en `supabase/migrations/` y **se aplican manualmente pegándolas en el SQL Editor de Supabase**, no con `supabase db push`. No existe `supabase/config.toml` ni archivo de seed.

| Archivo | Qué introduce |
|---|---|
| `0001_initial_schema.sql` | Enums, tablas base, índices, triggers, buckets de Storage |
| `0002_contract_control_backoffice.sql` | `manychat_contract_messages` y las vistas de backoffice (v1) |
| `20250516_whatsapp_migration.sql` | Migración ManyChat → WhatsApp: renombres y tablas `whatsapp_*` |
| `20250520_fix_backoffice_view_whatsapp.sql` | Redefine las vistas tras el renombre |
| `20250526_contract_requests_whatsapp_subscriber.sql` | `whatsapp_subscriber_id`; valor `whatsapp` en dos enums |
| `20250612_fix_whatsapp_message_status_text.sql` | `status` pasa a `text`; **versión autoritativa de las vistas** |
| `20250701_contract_employee_fields.sql` | Campos de empleado para el contrato + `company_settings` |
| `20250701_easylex_validation_settings.sql` | Flags de validación de EasyLex en `company_settings` |
| `20260720`–`20260722` | RLS: deny-all, aprovisionamiento de perfiles/roles, políticas por rol (fase B) |
| `20260723_restrict_sensitive_reads.sql` | Restringe la lectura de `employee_bank_accounts` y `raw_import_rows` a `operaciones`+ |
| `20260724_whatsapp_message_dedup.sql` | `dedup_key` + índice único parcial (idempotencia de envíos) |
| `20260730_signed_contracts.sql` | Bucket privado `contratos-firmados` + columna `contract_attempts.signed_pdf_path` (PDF firmado archivado) |
| `20260731_bulk_send_mode_status.sql` | Amplía el CHECK de `whatsapp_bulk_sends.mode` a `('import','manual','status')` |

RLS se activa en modo deny-all con `20260720` y se completa con las políticas por rol de `20260722`. Storage tiene tres buckets: `imports`, `import-reports` y `contratos-firmados` (privado, `application/pdf`). Ver [Seguridad](#seguridad-y-control-de-acceso).

---

## Enums

| Enum | Valores |
|---|---|
| `import_status` | `recibida`, `validando`, `aplicada`, `aplicada_con_errores`, `fallida` |
| `row_status` | `pendiente`, `valida`, `invalida`, `duplicada`, `sin_cambios`, `aplicada` |
| `offer_status` | `vigente`, `reemplazada`, `solicitada`, `firmada`, `rechazada` |
| `contract_request_status` | `recibida`, `generando`, `link_generado`, `firmado`, `error` |
| `contract_attempt_status` | `generando`, `generado`, `expirado`, `firmado`, `error` |
| `integration_status` | `pending`, `success`, `failed`, `retrying` |
| `integration_provider` | `manychat`, `easylex`, `supabase`, `backend`, `whatsapp` |
| `integration_direction` | `inbound`, `outbound`, `internal` |
| `audit_source` | `csv`, `manychat`, `backend`, `easylex`, `backoffice`, `system`, `whatsapp` |
| `user_role` | `admin`, `operaciones`, `solo_lectura` |

`manychat` y `easylex` siguen presentes en `integration_provider` y `audit_source` por compatibilidad con filas históricas; el código nuevo escribe `whatsapp`.

Existe un enum huérfano, `manychat_contract_message_status` (`pendiente_envio`, `enviado`, `entregado`, `click`, `error`, `omitido`). La única columna que lo usaba se convirtió a `text` en `20250612`, así que el tipo ya no gobierna nada.

---

## Tablas

### Identidad y acceso

#### `profiles`
Perfil del usuario interno del backoffice, vinculado a Supabase Auth.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | → `auth.users(id)` ON DELETE CASCADE |
| `email` | `text` | |
| `role` | `user_role` | NOT NULL, default `solo_lectura` |
| `created_at` / `updated_at` | `timestamptz` | default `now()`, trigger `set_updated_at` |

`20260721_profiles_provisioning_and_roles.sql` añade el trigger `on_auth_user_created`, que crea el perfil automáticamente al darse de alta un usuario, y rellena los que ya existían. **Antes nada creaba filas: la tabla estaba vacía y `role` no gobernaba nada.**

El rol se aplica en la aplicación mediante `requireRole()`. Ver [API](api.md#autorización-por-rol).

La misma migración expone `public.current_user_role()`, pensada para las políticas RLS de la fase B:

```sql
create policy "operaciones puede leer empleados" on public.employees
  for select using (public.current_user_role() in ('admin','operaciones'));
```

### Importación

#### `import_batches`
Un lote por archivo CSV recibido.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `filename` | `text` | NOT NULL |
| `storage_bucket` | `text` | NOT NULL, default `imports` |
| `storage_path` | `text` | |
| `uploaded_by` | `uuid` | → `profiles(id)` ON DELETE SET NULL |
| `status` | `import_status` | NOT NULL, default `recibida` |
| `total_rows`, `valid_rows`, `invalid_rows`, `duplicate_rows`, `unchanged_rows`, `changed_rows`, `applied_rows` | `integer` | NOT NULL, default 0, `CHECK (>= 0)` |
| `error_summary`, `metadata` | `jsonb` | NOT NULL, default `{}` |
| `created_at` / `updated_at` | `timestamptz` | trigger `set_updated_at` |
| `applied_at` | `timestamptz` | nullable; se llena al aplicar el lote |

#### `raw_import_rows`
Staging: una fila por línea del CSV, cruda y normalizada.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | |
| `batch_id` | `uuid` | NOT NULL → `import_batches` ON DELETE CASCADE |
| `row_number` | `integer` | NOT NULL, `CHECK (> 0)` |
| `raw_payload` | `jsonb` | NOT NULL — la fila tal como llegó |
| `normalized_payload` | `jsonb` | NOT NULL, default `{}` |
| `row_hash` | `text` | detección de cambios entre importaciones |
| `rfc`, `telefono_normalizado`, `clabe_last4` | `text` | extraídos para búsqueda e índices |
| `status` | `row_status` | NOT NULL, default `pendiente` |
| `errors`, `warnings` | `jsonb` | NOT NULL, default `[]` |
| `created_at` / `updated_at` | `timestamptz` | trigger `set_updated_at` |

Constraint: `UNIQUE (batch_id, row_number)`.

### Empleados y ofertas

#### `employees`
Identidad operativa. **El RFC es la identidad principal**; el teléfono es dato de contacto.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | |
| `rfc` | `text` | NOT NULL, UNIQUE |
| `curp` | `text` | único cuando existe (índice parcial) |
| `nombre` | `text` | NOT NULL |
| `apellidos` | `text` | |
| `cp_csf` | `text` | CP según Constancia de Situación Fiscal |
| `telefono` | `text` | NOT NULL — valor original del CSV |
| `telefono_normalizado` | `text` | NOT NULL — solo dígitos |
| `email`, `empleador` | `text` | |
| `source_batch_id`, `source_row_id` | `uuid` | procedencia; ON DELETE SET NULL |
| `created_at` / `updated_at` | `timestamptz` | trigger `set_updated_at` |

Campos añadidos en `20250701_contract_employee_fields.sql` para poder llenar el contrato, todos nullable: `apellido_paterno`, `apellido_materno`, `estado_civil`, `nacionalidad`, `lugar_origen`, `fecha_nacimiento` (`date`), `domicilio`. La migración incluye un backfill que parte `apellidos` por el primer espacio.

Constraints:
- `employees_rfc_format` — `rfc = upper(trim(rfc))` y longitud entre 12 y 13.
- `employees_curp_format` — si existe, `upper(trim(...))` y longitud exactamente 18.
- `employees_phone_normalized_format` — `telefono_normalizado ~ '^[0-9]{10,15}$'`.

#### `employee_bank_accounts`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | |
| `employee_id` | `uuid` | NOT NULL → `employees` ON DELETE CASCADE |
| `clabe` | `text` | NOT NULL, `CHECK (clabe ~ '^[0-9]{18}$')` |
| `clabe_last4` | `text` | `GENERATED ALWAYS AS (right(clabe,4)) STORED` |
| `banco` | `text` | NOT NULL |
| `is_active` | `boolean` | NOT NULL, default `true` |
| `source_batch_id`, `source_row_id` | `uuid` | |
| `created_at` / `updated_at` | `timestamptz` | trigger `set_updated_at` |

Un índice único parcial garantiza **una sola cuenta activa por empleado**.

#### `advance_offers`
Ofertas versionadas. Solo una `is_current` por empleado.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | |
| `employee_id` | `uuid` | NOT NULL → `employees` ON DELETE CASCADE |
| `monto_prestamo_autorizado` | `numeric(12,2)` | NOT NULL, `CHECK (>= 0)` |
| `estatus_p_esta_q`, `estatus_cliente` | `text` | referencia/auditoría del CSV |
| `estatus_conversion` | `text` | NOT NULL, `CHECK (IN ('aceptada','rechazada'))` |
| `is_eligible` | `boolean` | `GENERATED ALWAYS AS (estatus_conversion = 'aceptada') STORED` |
| `is_current` | `boolean` | NOT NULL, default `true` |
| `status` | `offer_status` | NOT NULL, default `vigente` |
| `source_batch_id`, `source_row_id`, `source_hash` | | procedencia y detección de cambios |
| `replaced_by_offer_id` | `uuid` | → `advance_offers` SET NULL; `CHECK (<> id)` |
| `created_at` / `updated_at` | `timestamptz` | trigger `set_updated_at` |

La elegibilidad es una columna **generada**: no se escribe a mano, se deriva de `estatus_conversion`.

#### `advance_offer_revisions`
Historial de por qué una oferta reemplazó a otra. Append-only (sin `updated_at` ni trigger).

Columnas: `id`, `employee_id`, `previous_offer_id`, `new_offer_id`, `batch_id`, `row_id`, `previous_values jsonb`, `new_values jsonb`, `change_hash text NOT NULL`, `created_at`.

### Contratos

#### `contract_requests`
Una solicitud por oferta. `UNIQUE (offer_id)`.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | |
| `employee_id` | `uuid` | NOT NULL → `employees` ON DELETE **RESTRICT** |
| `offer_id` | `uuid` | NOT NULL → `advance_offers` ON DELETE **RESTRICT**, UNIQUE |
| `status` | `contract_request_status` | NOT NULL, default `recibida` |
| `requested_from` | `text` | NOT NULL, default `'manychat'` (default heredado, ver notas) |
| `whatsapp_subscriber_id` | `text` | añadido en `20250526` |
| `manychat_subscriber_id` | `text` | legado, conservado |
| `contract_snapshot` | `jsonb` | NOT NULL, default `{}` — datos congelados al generar |
| `requested_at` | `timestamptz` | NOT NULL, default `now()` |
| `signed_at`, `error_message` | | |
| `created_at` / `updated_at` | `timestamptz` | trigger `set_updated_at` |

`ON DELETE RESTRICT` es deliberado: no se puede borrar un empleado u oferta con contrato asociado.

El **snapshot** congela nombre, apellidos, RFC, CURP, CLABE, banco, monto, empleador, teléfono, email y la procedencia (`source_batch_id`, `source_row_id`) en el momento de generar el link, para que una reimportación posterior no altere lo firmado.

#### `contract_attempts`
Cada intento de generar un link de firma dentro de una solicitud.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | |
| `contract_request_id` | `uuid` | NOT NULL → `contract_requests` ON DELETE CASCADE |
| `attempt_number` | `integer` | NOT NULL, `CHECK (> 0)`; `UNIQUE (contract_request_id, attempt_number)` |
| `easylex_contract_id` | `text` | único cuando existe |
| `signing_url` | `text` | |
| `status` | `contract_attempt_status` | NOT NULL, default `generando` |
| `expires_at`, `generated_at`, `signed_at` | `timestamptz` | |
| `error_message` | `text` | |
| `raw_response` | `jsonb` | NOT NULL, default `{}` — respuesta cruda de EasyLex |
| `created_at` / `updated_at` | `timestamptz` | trigger `set_updated_at` |

Regenerar un link expirado crea un **nuevo intento** dentro de la misma solicitud; nunca sobrescribe el anterior.

#### `easylex_events`
Eventos recibidos de EasyLex. Usa `received_at` en lugar de `created_at`.

Columnas: `id`, `contract_request_id`, `contract_attempt_id`, `easylex_contract_id`, `event_id`, `event_type NOT NULL`, `raw_payload jsonb`, `status integration_status`, `error_message`, `received_at`, `processed_at`, `updated_at`.

`event_id` tiene un índice único parcial: es el mecanismo de **idempotencia de webhooks**.

### WhatsApp

#### `whatsapp_contacts`
(`manychat_contacts` renombrada en `20250516`.)

Columnas: `id`, `employee_id`, `subscriber_id text UNIQUE`, `wa_id`, `telefono_normalizado`, `first_name`, `last_name`, `last_seen_at`, `metadata jsonb`, `created_at`, `updated_at`.

#### `whatsapp_contract_messages`
Un registro por mensaje de contrato enviado.

Columnas: `id`, `employee_id`, `offer_id`, `contract_request_id`, `whatsapp_subscriber_id`, `message_type text` (default `contract_offer`), `status text`, `bulk_send_id`, `wa_message_id` (el `wamid` de Meta), `delivery_status text` (default `sent`), `delivered_at`, `read_at`, `clicked_at`, `error_message`, `retry_count integer`, `correlation_id`, `metadata jsonb`, `created_at`.

> **Divergencia real entre instalaciones.** Una base migrada desde ManyChat conserva además `sent_at`, `campaign_name`, `flow_name`, `manychat_contact_id` y `updated_at`; una instalación nueva creada por `20250516` no las tiene. Además, `20250612` quitó el `NOT NULL`, el `DEFAULT` y el tipo enum de `status`, dejándolo como `text` sin restricción: las filas migradas guardan etiquetas en español (`enviado`, `entregado`, `click`) y el código nuevo escribe inglés (`sent`, `delivered`, `read`, `failed`). Las vistas de backoffice aceptan ambos vocabularios.

#### `whatsapp_bulk_sends`
Un registro por envío masivo.

Columnas: `id`, `mode text CHECK (IN ('import','manual'))`, `import_id`, `employee_ids text[]`, `eligible_count`, `sent_count`, `failed_count`, `delivered_count`, `read_count`, `status text CHECK (IN ('pending','sending','completed','failed'))`, `error_summary text`, `created_by text`, `created_at`.

Los contadores se actualizan con la función `increment_bulk_send_counter`.

#### `whatsapp_templates`
Caché local de las plantillas aprobadas en Meta.

Columnas: `id`, `meta_template_id text UNIQUE`, `name`, `status` (default `PENDING`), `category` (default `UTILITY`), `language` (default `es_MX`), `components jsonb`, `synced_at`, `created_at`.

### Configuración

#### `company_settings`
Configuración de negocio editable sin redeploy. `key text UNIQUE`, `value text`, `description`, `updated_by → profiles`, timestamps con trigger.

Claves sembradas en `20250701_contract_employee_fields.sql` (`ON CONFLICT DO NOTHING`):

| Clave | Valor sembrado |
|---|---|
| `acreedor_razon_social` | `LOZAV CONSTRUCTORES, SOCIEDAD ANÓNIMA DE CAPITAL VARIABLE` |
| `acreedor_representante` | `DARA JAHDAI LOPEZ DE LOS ANGELES` |
| `acreedor_rfc` | `LCO2105032T5` |
| `acreedor_domicilio` | `Del Gran Parque número 225, Interior C, colonia Cumbres, C.P. 64610, Monterrey, Nuevo León` |
| `acreedor_banco`, `acreedor_cuenta`, `acreedor_clabe`, `testigo_1_nombre`, `testigo_2_nombre` | vacías — marcadas `(LLENAR)` |

Desde 2026-07-31 las cuatro de identidad (`acreedor_razon_social/representante/rfc/domicilio`) **sí llegan al contrato** vía placeholders `{{razon_social_acreedor}}`… con respaldo en código si están vacías; las cinco `(LLENAR)` no tienen respaldo. Editables desde "Datos de empresa". Ver [Configuración](configuracion.md#datos-del-acreedor-contrato).

Claves de `20250701_easylex_validation_settings.sql`, todas booleanos en texto: `easylex_validate_biometric` = `true`, `easylex_validate_liveness` = `true`; `easylex_validate_id`, `easylex_validate_sms`, `easylex_validate_picture`, `easylex_validate_email`, `easylex_validate_voice` = `false`.

#### `settings`
Tabla anterior, más simple (`key`, `value`, `updated_at`), usada por la pantalla de credenciales de WhatsApp. Coexiste con `company_settings` y es en gran medida redundante; se conserva porque el formulario de configuración escribe ahí.

### Trazabilidad

#### `integration_logs`
Toda llamada saliente/entrante con servicios externos. Append-only.

Columnas: `id`, `provider integration_provider`, `direction integration_direction`, `endpoint`, `method`, `request_payload jsonb`, `response_payload jsonb`, `status_code`, `status integration_status`, `success boolean`, `error_message`, `correlation_id`, `entity_type`, `entity_id`, `created_at`.

#### `audit_events`
Timeline legible por humanos. Append-only.

Columnas: `id`, `event_name NOT NULL`, `entity_type`, `entity_id`, `employee_id`, `correlation_id`, `source audit_source`, `previous_state`, `new_state`, `summary NOT NULL`, `metadata jsonb`, `actor_type`, `actor_id`, `created_at`.

La distinción es intencional: `integration_logs` sirve para depurar, `audit_events` para dar soporte y explicar qué pasó con un empleado.

---

## Índices

**Únicos parciales** (aquí es donde vive gran parte de las reglas de negocio):

| Índice | Regla que impone |
|---|---|
| `employees_curp_unique_idx` | CURP único cuando existe |
| `employee_bank_accounts_one_active_idx` | una sola cuenta activa por empleado |
| `advance_offers_one_current_per_employee_idx` | una sola oferta vigente por empleado |
| `contract_requests_one_active_per_employee_idx` | una sola solicitud activa por empleado (`status IN ('recibida','generando','link_generado')`) |
| `contract_attempts_easylex_contract_unique_idx` | un `easylex_contract_id` no se repite |
| `easylex_events_event_id_unique_idx` | idempotencia de webhooks de EasyLex |

**De búsqueda:** `employees_telefono_normalizado_idx`, `employees_email_idx`, `advance_offers_employee_status_idx`, `advance_offers_estatus_conversion_idx`, `advance_offers_is_eligible_idx`, `raw_import_rows_batch_status_idx`, `raw_import_rows_rfc_idx`, `contract_requests_status_idx`, `contract_attempts_request_status_idx`, `contract_attempts_expires_at_idx`, `easylex_events_contract_idx`, `integration_logs_provider_created_idx`, `integration_logs_correlation_idx`, `audit_events_employee_created_idx`, `audit_events_entity_idx`, y los `idx_whatsapp_*` sobre las tablas de WhatsApp.

---

## Vistas

Ambas vistas se redefinieron tres veces. **La definición válida es la de `20250612_fix_whatsapp_message_status_text.sql`**; las versiones de `0002` y `20250520` quedaron atrás.

### `backoffice_contract_control_v1`

Una fila por empleado, con todo lo necesario para la pantalla de control. Se construye con CTEs: `current_offers` (`is_current = true`), `latest_attempts` (`DISTINCT ON (contract_request_id)` por `attempt_number DESC, created_at DESC`), `latest_audit` (`DISTINCT ON (employee_id)`), más un `LEFT JOIN LATERAL` que elige el mensaje de WhatsApp más relevante — prefiere coincidencia por `offer_id`, luego el más reciente por `clicked_at`/`delivered_at`/`created_at`.

**Los datos bancarios están deliberadamente excluidos de la vista.** La CLABE nunca llega a las pantallas operativas.

Columnas expuestas: identidad (`employee_id`, `nombre`, `apellidos`, `empleado`, `rfc`, `telefono_normalizado`, `email`, `empleador`), oferta (`offer_id`, `monto_prestamo_autorizado`, `is_eligible`, `offer_status`, `estatus_conversion`), mensaje (`whatsapp_message_id`, `message_status`, `message_sent_at`, `message_delivered_at`, `message_clicked_at`, `message_error`, `whatsapp_subscriber_id`), contrato (`contract_request_id`, `contract_status`, `contract_requested_at`, `contract_signed_at`, `contract_error`), intento (`contract_attempt_id`, `easylex_contract_id`, `signing_url`, `contract_attempt_status`, `contract_generated_at`, `link_expires_at`, `attempt_signed_at`, `attempt_error`) y derivados (`operational_status`, `last_movement_at`, `last_audit_event`, `last_audit_summary`, `last_audit_source`, `last_audit_at`).

Dos detalles a tener presentes: `message_sent_at` se mapea desde `created_at` del mensaje, no desde `sent_at`; y `message_status` es `coalesce(status, 'pendiente_envio')`.

#### `operational_status`

Es un `CASE` y **gana la primera coincidencia**, en este orden:

| Orden | Estado | Condición |
|---|---|---|
| 1 | `firmado` | el contrato está firmado |
| 2 | `error` | hay error registrado |
| 3 | `link_expirado` | `expires_at <= now()` y no firmado |
| 4 | `contrato_generado` | hay `signing_url` |
| 5 | `contrato_en_proceso` | solicitud en `recibida` o `generando` |
| 6 | `solicitado` | el mensaje registra `click` |
| 7 | `mensaje_enviado` | status en `sent`, `enviado`, `delivered`, `entregado`, `read` |
| 8 | `pendiente_envio` | la oferta es elegible |
| 9 | `no_elegible` | resto |

Los dos vocabularios (inglés/español) en el paso 7 son el mecanismo que hace convivir filas migradas y nuevas.

`last_movement_at` es un `greatest()` sobre 9 timestamps, con `-infinity` como relleno para los nulos.

### `backoffice_contract_timeline_v1`

`UNION ALL` de cuatro ramas, todas emitiendo `employee_id, entity_type, entity_id, occurred_at, source, event_type, status, summary, metadata`:

1. `audit_events` (donde `employee_id` no es nulo) — `source` es el propio del evento.
2. `whatsapp_contract_messages` — `source = 'whatsapp'`, `event_type = 'whatsapp_contract_message_' || status`.
3. `contract_requests` — `source = 'backend'`.
4. `contract_attempts` unida a solicitudes — `source = 'easylex'`.

Cada rama genera un `summary` legible en español según el estado.

---

## Funciones y triggers

**Funciones**

- `set_updated_at()` — trigger en `plpgsql`, asigna `new.updated_at = now()`.
- `increment_bulk_send_counter(p_bulk_send_id uuid, p_field text)` — incrementa `sent_count`, `failed_count`, `delivered_count` o `read_count`. Con cualquier otro valor **no hace nada y no falla**, lo cual puede ocultar errores de tipeo en el nombre del campo.

**Triggers `set_updated_at` BEFORE UPDATE** en: `profiles`, `import_batches`, `raw_import_rows`, `employees`, `employee_bank_accounts`, `advance_offers`, `whatsapp_contacts`, `contract_requests`, `contract_attempts`, `easylex_events`, `whatsapp_contract_messages` (en instalaciones migradas) y `company_settings`.

No lo tienen, por diseño: `advance_offer_revisions`, `integration_logs` y `audit_events` (append-only), ni las tablas `whatsapp_*` creadas desde cero en `20250516`.

---

## Storage

Dos buckets privados creados en `0001` (`ON CONFLICT DO NOTHING`):

| Bucket | Límite | MIME permitidos |
|---|---|---|
| `imports` | 50 MB | `text/csv`, `application/csv`, `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| `import-reports` | 10 MB | `text/csv`, `application/json`, `text/plain` |

---

## Tipado desde TypeScript

**No hay tipos generados.** No existe `database.types.ts` ni un directorio `src/types/`, y no se pasa el genérico `Database` a `createClient` en ningún punto: las consultas a Supabase son sin tipar y cada punto de llamada declara sus propias interfaces.

El espejo más completo del esquema es `src/lib/backoffice/contract-control.ts`, que replica a mano las 41 columnas de `backoffice_contract_control_v1` en `ContractControlRow`, junto con `ContractOperationalStatus` (los 9 valores del `CASE`, en el mismo orden), `ContractControlFilters`, `ContractControlData`, `DashboardKpis` y la constante `CONTRACT_CONTROL_SELECT` con la lista explícita de columnas.

Como no hay generación automática, **cualquier cambio de esquema exige actualizar estos tipos a mano**; el compilador no lo detecta.

---

## Seguridad y control de acceso

### RLS: deny-all (fase A)

`20260720_enable_rls_deny_all.sql` activa RLS **sin políticas** en las 18 tablas, y pone `security_invoker = on` en las dos vistas de backoffice para que la RLS de las tablas base también se aplique al consultarlas.

Que no haya políticas significa deny-all: **cero filas para cualquier rol que no sea `service_role`**, que tiene `BYPASSRLS`. Como toda la aplicación consulta con service role, el comportamiento no cambia — la migración es segura de aplicar sobre una base en uso.

Lo que aporta es defensa en profundidad: la `anon key` es pública por diseño y viaja al navegador; antes de esta migración habría devuelto datos si alguien la hubiera apuntado a estas tablas, y ahora no devuelve nada.

### Fase B: políticas por rol y lecturas de sesión

`20260722_rls_policies_phase_b.sql` añade las políticas de **SELECT** por rol para el cliente de sesión (`authenticated`):

- Datos operativos (empleados, ofertas, contratos, whatsapp, importación, `audit_events`) → cualquier usuario aprovisionado (`solo_lectura`+).
- `profiles` → la propia fila; todas para `admin`.
- `settings`, `company_settings`, `integration_logs` → solo `admin`.

No hay políticas de escritura: las escrituras siguen por service role (webhooks, acciones, jobs), y el cliente de sesión no debe escribir. Sin política de INSERT/UPDATE/DELETE, `authenticated` no puede modificar nada.

Las lecturas se mueven al cliente de sesión mediante `getReadClient()` (`src/lib/supabase/read-client.ts`), controlado por el flag `RLS_SESSION_READS`:

- `off` (por defecto) → service role, bypass de RLS, comportamiento histórico.
- `on` → cliente de sesión, sujeto a las políticas.

**Primer camino migrado:** el modelo de control de contratos (`src/lib/backoffice/contract-control.ts`), que alimenta el dashboard y la lista de contratos. El resto de lecturas sigue en service role, pendiente de migrar una a una con el mismo patrón.

> **RLS activa y verificada (2026-07-21).** Las migraciones `20260720`, `20260721` y `20260722` están aplicadas; la anon key pública devuelve **0 filas** en las 18 tablas. Antes de encender `RLS_SESSION_READS`, endurecer la política de lectura de las tablas más sensibles ([M1](seguridad.md#plan-de-endurecimiento)). Ver [Configuración](configuracion.md#seguridad-y-checklist-de-produccion) y [Seguridad](seguridad.md).

`current_user_role()` (SECURITY DEFINER) lee el rol aunque `profiles` tenga RLS, y devuelve null sin sesión, de modo que las políticas basadas en ella excluyen al acceso anónimo.

La fase B consiste en mover las lecturas del backoffice al cliente de sesión con políticas basadas en `auth.uid()` y el rol, dejando la service role solo para webhooks y procesos de sistema. Hasta entonces, **un cliente de service-role expuesto al navegador seguiría exponiendo la base completa**.

---

## Deudas conocidas del esquema

Documentadas aquí para que no se redescubran:

- `contract_requests.requested_from` sigue teniendo default `'manychat'`.
- `contract_requests` conserva `manychat_subscriber_id` junto a `whatsapp_subscriber_id`, y la vista de timeline aún lee el campo legado hacia `metadata`.
- `whatsapp_contract_messages.status` es `text` sin restricción, con dos vocabularios conviviendo.
- El esquema de `whatsapp_contract_messages` difiere entre instalación nueva y migrada.
- `settings` y `company_settings` cumplen funciones solapadas.
- El enum `manychat_contract_message_status` ya no gobierna ninguna columna.

Ver también: [Importación CSV](importacion-csv.md) · [API](api.md) · [Testing](testing.md)
