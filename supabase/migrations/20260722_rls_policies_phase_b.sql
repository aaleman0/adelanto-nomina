-- =============================================================================
-- Fase B de RLS: políticas de lectura por rol
-- =============================================================================
--
-- CONTEXTO
-- La fase A (20260720) activó RLS en modo deny-all: sin políticas, cualquier
-- rol distinto de service_role obtiene cero filas. La aplicación siguió
-- funcionando porque todo se consultaba con la service role key, que hace
-- bypass de RLS.
--
-- QUÉ HACE ESTA MIGRACIÓN
-- Añade políticas de SELECT para el rol `authenticated` (el que usa el cliente
-- de sesión: anon key + JWT del usuario). A partir de aquí, una lectura hecha
-- con el cliente de sesión devuelve datos según el rol del usuario.
--
-- SEGURIDAD DE APLICARLA
-- Es ADITIVA y no cambia el comportamiento actual: mientras una consulta siga
-- usando la service role key, RLS se ignora. Las políticas solo entran en juego
-- cuando una lectura se mueve al cliente de sesión, cosa que se hace de forma
-- incremental. Aplicar esto hoy no rompe nada.
--
-- NO SE AÑADEN POLÍTICAS DE ESCRITURA. Las escrituras (webhooks, acciones de
-- backoffice, importación) siguen yendo por service role, y el cliente de
-- sesión no debe escribir directamente. Sin política de INSERT/UPDATE/DELETE,
-- esas operaciones quedan denegadas para `authenticated` — que es justo lo que
-- se quiere: la anon key, aunque se filtre al navegador, no puede modificar
-- nada.
--
-- MODELO DE ROLES (acumulativo: solo_lectura < operaciones < admin)
-- - Datos operativos  → cualquier usuario aprovisionado (solo_lectura y más).
-- - profiles          → cada quien su propia fila; admin ve todas.
-- - settings,
--   company_settings  → solo admin (configuración sensible).
-- - integration_logs  → solo admin (payloads crudos con PII y tokens).
-- - audit_events      → solo_lectura y más (evidencia que consulta soporte).
--
-- `public.current_user_role()` (definida en 20260721) es SECURITY DEFINER, así
-- que puede leer el rol del usuario aunque `profiles` tenga RLS. Devuelve null
-- para un cliente sin sesión (anon sin JWT), de modo que las políticas basadas
-- en ella excluyen naturalmente al acceso anónimo.
--
-- APLICACIÓN
-- Pegar en el SQL Editor de Supabase. Es idempotente.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Lectura operativa: cualquier usuario aprovisionado (solo_lectura y más)
-- ---------------------------------------------------------------------------

do $$
declare
  target_table text;
  operational_tables text[] := array[
    'import_batches',
    'raw_import_rows',
    'employees',
    'employee_bank_accounts',
    'advance_offers',
    'advance_offer_revisions',
    'contract_requests',
    'contract_attempts',
    'easylex_events',
    'whatsapp_contacts',
    'whatsapp_contract_messages',
    'whatsapp_bulk_sends',
    'whatsapp_templates',
    'audit_events'
  ];
begin
  foreach target_table in array operational_tables loop
    if to_regclass('public.' || quote_ident(target_table)) is not null then
      execute format('drop policy if exists rls_select_operativo on public.%I', target_table);
      execute format(
        'create policy rls_select_operativo on public.%I '
        || 'for select to authenticated '
        || 'using (public.current_user_role() is not null)',
        target_table
      );
      raise notice 'Política de lectura operativa en public.%', target_table;
    else
      raise notice 'Tabla public.% no existe, se omite', target_table;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. profiles: la propia fila para todos; todas para admin
-- ---------------------------------------------------------------------------

drop policy if exists rls_select_profile_propio on public.profiles;
create policy rls_select_profile_propio on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.current_user_role() = 'admin');

-- ---------------------------------------------------------------------------
-- 3. Configuración sensible: solo admin
-- ---------------------------------------------------------------------------

do $$
declare
  target_table text;
  admin_only_tables text[] := array['settings', 'company_settings', 'integration_logs'];
begin
  foreach target_table in array admin_only_tables loop
    if to_regclass('public.' || quote_ident(target_table)) is not null then
      execute format('drop policy if exists rls_select_admin on public.%I', target_table);
      execute format(
        'create policy rls_select_admin on public.%I '
        || 'for select to authenticated '
        || 'using (public.current_user_role() = ''admin'')',
        target_table
      );
      raise notice 'Política de lectura admin en public.%', target_table;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
-- Listar las políticas creadas:
--   select tablename, policyname, cmd
--   from pg_policies
--   where schemaname = 'public'
--   order by tablename, policyname;
--
-- Comprobar como un usuario concreto (desde el SQL Editor con rol de sesión):
--   set request.jwt.claim.sub = '<uuid del usuario>';
--   select count(*) from public.employees;   -- debe devolver filas si tiene rol
-- =============================================================================
