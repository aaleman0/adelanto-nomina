-- =============================================================================
-- Endurecimiento RLS (M1): lectura restringida de tablas muy sensibles
-- =============================================================================
--
-- CONTEXTO
-- La fase B (20260722) dio a TODAS las tablas operativas la misma política de
-- lectura: `current_user_role() is not null`, es decir, cualquier usuario
-- aprovisionado (incluido `solo_lectura`). Para la mayoría está bien, pero dos
-- tablas guardan PII especialmente sensible que un rol de solo lectura no
-- debería ver:
--
--   - employee_bank_accounts → CLABE / cuentas bancarias.
--   - raw_import_rows        → filas crudas del CSV (PII sin normalizar,
--                              incluidos datos bancarios).
--
-- QUÉ HACE
-- Reemplaza la política operativa amplia por una restringida a `operaciones` y
-- `admin` en esas dos tablas. El modelo de roles es acumulativo
-- (solo_lectura < operaciones < admin), así que la lista `('operaciones','admin')`
-- cubre a operaciones y por encima.
--
-- SEGURIDAD DE APLICARLA
-- Es ADITIVA respecto al comportamiento actual: la app lee con service role
-- (bypass de RLS), así que hoy no cambia nada visible. Solo endurece lo que verá
-- el cliente de sesión cuando se encienda `RLS_SESSION_READS`. Debe aplicarse
-- ANTES de encender ese flag.
--
-- APLICACIÓN
-- Pegar en el SQL Editor de Supabase. Es idempotente.
-- =============================================================================

do $$
declare
  target_table text;
  sensitive_tables text[] := array[
    'employee_bank_accounts',
    'raw_import_rows'
  ];
begin
  foreach target_table in array sensitive_tables loop
    if to_regclass('public.' || quote_ident(target_table)) is not null then
      -- Quitar la política operativa amplia heredada de la fase B.
      execute format('drop policy if exists rls_select_operativo on public.%I', target_table);
      -- Recrear la lectura solo para operaciones y admin.
      execute format('drop policy if exists rls_select_sensible on public.%I', target_table);
      execute format(
        'create policy rls_select_sensible on public.%I '
        || 'for select to authenticated '
        || 'using (public.current_user_role() in (''operaciones'', ''admin''))',
        target_table
      );
      raise notice 'Lectura sensible restringida a operaciones+ en public.%', target_table;
    else
      raise notice 'Tabla public.% no existe, se omite', target_table;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
-- Ver la política resultante:
--   select tablename, policyname, cmd, qual
--   from pg_policies
--   where schemaname = 'public'
--     and tablename in ('employee_bank_accounts', 'raw_import_rows')
--   order by tablename, policyname;
--
-- La anon key (sin sesión) debe seguir devolviendo 0 filas en ambas.
-- =============================================================================
