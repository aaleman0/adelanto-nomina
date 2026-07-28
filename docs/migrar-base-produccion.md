# Migrar una base de producción

Runbook para cuando aprovisiones una **base de Supabase de producción separada**
de la de desarrollo. No aplica si despliegas apuntando a la base actual (ya está
migrada).

> ⚠️ **Lo más importante:** si creas una base nueva y **no** aplicas las
> migraciones de RLS, la `anon key` pública leerá **todas las tablas** (PII,
> CLABE, contratos) — la fuga de datos exacta que se cerró en dev. Aplicar las
> migraciones no es opcional: es la barrera de seguridad de la base.

## 1. Aplicar todas las migraciones, en orden

Supabase → proyecto de producción → **SQL Editor**. Pega y ejecuta cada archivo
de `supabase/migrations/` **en este orden** (orden de nombre de archivo):

```
0001_initial_schema.sql
0002_contract_control_backoffice.sql
20250516_whatsapp_migration.sql
20250520_fix_backoffice_view_whatsapp.sql
20250526_contract_requests_whatsapp_subscriber.sql
20250612_fix_whatsapp_message_status_text.sql
20250701_contract_employee_fields.sql
20250701_easylex_validation_settings.sql
20260720_enable_rls_deny_all.sql          # RLS deny-all + security_invoker en vistas
20260721_profiles_provisioning_and_roles.sql
20260722_rls_policies_phase_b.sql         # políticas de lectura por rol
20260723_restrict_sensitive_reads.sql     # M1: CLABE / PII cruda → operaciones+
20260724_whatsapp_message_dedup.sql       # idempotencia del envío inline
```

Todas son idempotentes: si tienes que re-correr una, no rompe.

## 2. Verificar el invariante de RLS (obligatorio)

Con las credenciales de la base de prod en el entorno, corre:

```bash
set -a; . ./.env.local; set +a          # o exporta SUPABASE_URL + SUPABASE_ANON_KEY de prod
RUN_RLS_CHECK=1 pnpm exec vitest run src/lib/security/rls-invariant.test.ts
```

Debe dar **20/20 en verde** (18 tablas + 2 vistas, todas con **0 filas** para la
anon key). Si alguna tabla expone filas, RLS no quedó aplicada: revisa la
migración correspondiente antes de abrir el servicio. Es lo mismo que
`pnpm verify:rls`.

## 3. Verificar la migración de dedup (opcional pero rápido)

En el SQL Editor:

```sql
select column_name from information_schema.columns
where table_name = 'whatsapp_contract_messages' and column_name = 'dedup_key';
select indexname from pg_indexes where indexname = 'uq_whatsapp_messages_dedup';
```

Ambas deben devolver una fila. Con eso, la idempotencia por empleado del envío
inline queda activa (si falta, la app degrada y envía sin dedup, sin romper).

## 4. Después de migrar

- Solo tras confirmar el count 0, puedes poner `RLS_SESSION_READS=on` para mover
  las lecturas del backoffice al cliente de sesión. Ver [Configuración](configuracion.md).
- Completa las cinco claves `(LLENAR)` de `company_settings` (datos que van en el
  contrato).
- Borra de `settings` las filas antiguas con secretos en texto plano; los
  secretos van en el gestor de secretos, no en la base.

## Notas

- **No hay paso de migración automático en el pipeline**: se aplican a mano en el
  SQL Editor. Cualquier despliegue que dependa de un cambio de esquema requiere
  aplicarlo **antes**.
- Si más adelante quieres que el CI detecte drift de esquema (`db-types`), hace
  falta definir `SUPABASE_PROJECT_ID` + `SUPABASE_ACCESS_TOKEN` en el repo y
  generar `src/types/database.types.ts` una vez con `pnpm db:types`. Hoy el
  cliente no está tipado contra el esquema, así que es opcional.

Ver también: [Base de datos](base-de-datos.md) · [Configuración](configuracion.md) · [Infraestructura](infraestructura.md)
