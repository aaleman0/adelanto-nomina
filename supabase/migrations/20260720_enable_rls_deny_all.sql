-- =============================================================================
-- Habilitar Row Level Security (deny-all) en todas las tablas operativas
-- =============================================================================
--
-- CONTEXTO
-- Hasta ahora ninguna tabla tenía RLS. Todo el acceso ocurre desde el servidor
-- con la service role key, que en Supabase tiene el atributo BYPASSRLS. Eso
-- significa que la aplicación seguirá funcionando exactamente igual tras esta
-- migración: no se rompe ninguna consulta existente.
--
-- QUÉ APORTA ENTONCES
-- Defensa en profundidad. Hoy, si la `anon key` (que es pública por diseño y
-- viaja al navegador) se usara contra estas tablas, devolvería datos. Con RLS
-- habilitada y sin políticas, el resultado es cero filas para cualquier rol que
-- no sea service_role.
--
-- ESTRATEGIA
-- Fase A (esta migración): RLS activada sin políticas = deny-all.
-- Fase B (posterior): mover lecturas del backoffice al cliente de sesión y
--   añadir políticas basadas en auth.uid() y el rol del usuario, dejando la
--   service role key solo para webhooks y procesos de sistema.
--
-- APLICACIÓN
-- Pegar en el SQL Editor de Supabase. Es idempotente: se puede ejecutar varias
-- veces sin efecto adicional.
-- =============================================================================

do $$
declare
  target_table text;
  target_tables text[] := array[
    -- identidad y acceso
    'profiles',
    -- importación
    'import_batches',
    'raw_import_rows',
    -- empleados y ofertas
    'employees',
    'employee_bank_accounts',
    'advance_offers',
    'advance_offer_revisions',
    -- contratos
    'contract_requests',
    'contract_attempts',
    'easylex_events',
    -- whatsapp
    'whatsapp_contacts',
    'whatsapp_contract_messages',
    'whatsapp_bulk_sends',
    'whatsapp_templates',
    -- configuración
    'settings',
    'company_settings',
    -- trazabilidad
    'integration_logs',
    'audit_events'
  ];
begin
  foreach target_table in array target_tables loop
    -- to_regclass devuelve null si la tabla no existe: tolera las diferencias
    -- entre una instalación nueva y una migrada desde ManyChat.
    if to_regclass('public.' || quote_ident(target_table)) is not null then
      execute format(
        'alter table public.%I enable row level security',
        target_table
      );
      raise notice 'RLS habilitada en public.%', target_table;
    else
      raise notice 'Tabla public.% no existe, se omite', target_table;
    end if;
  end loop;
end $$;

-- =============================================================================
-- Vistas de backoffice: ejecutar con los permisos de quien consulta
-- =============================================================================
--
-- Por defecto una vista se evalúa con los permisos de su propietario, lo que
-- haría que la vista sirviera datos aunque las tablas subyacentes tengan RLS.
-- `security_invoker = on` (PostgreSQL 15+) hace que la RLS de las tablas base
-- sí se aplique a quien consulta la vista.
--
-- No afecta al funcionamiento actual, porque service_role sigue haciendo bypass.

do $$
begin
  if to_regclass('public.backoffice_contract_control_v1') is not null then
    execute 'alter view public.backoffice_contract_control_v1 set (security_invoker = on)';
  end if;

  if to_regclass('public.backoffice_contract_timeline_v1') is not null then
    execute 'alter view public.backoffice_contract_timeline_v1 set (security_invoker = on)';
  end if;
exception
  when others then
    -- security_invoker requiere PostgreSQL 15+. Si la instancia es anterior,
    -- se registra y se continúa: el resto de la migración sigue siendo válido.
    raise notice 'No se pudo aplicar security_invoker (¿PostgreSQL < 15?): %', sqlerrm;
end $$;

-- =============================================================================
-- Verificación
-- =============================================================================
-- Tras aplicar, esta consulta debe devolver 0 filas. Si devuelve alguna, esa
-- tabla quedó sin RLS:
--
--   select tablename
--   from pg_tables
--   where schemaname = 'public' and rowsecurity = false;
-- =============================================================================
