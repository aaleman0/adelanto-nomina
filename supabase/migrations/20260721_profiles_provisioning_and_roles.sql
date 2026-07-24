-- =============================================================================
-- Aprovisionamiento de perfiles y soporte de roles
-- =============================================================================
--
-- CONTEXTO
-- La tabla `profiles` existe desde el esquema inicial con una columna `role`,
-- pero nada creaba filas: al autenticarse por Google se creaba el usuario en
-- `auth.users` y ahí terminaba. En la práctica la tabla estaba vacía y la
-- columna `role` no gobernaba nada.
--
-- QUÉ HACE
-- 1. Crea automáticamente el perfil al darse de alta un usuario.
-- 2. Rellena los perfiles de los usuarios que ya existían.
-- 3. Expone `public.current_user_role()` para usarla en políticas RLS.
--
-- El rol por defecto es `solo_lectura`: un usuario nuevo no puede modificar
-- nada hasta que un administrador lo promueva. Ver la nota sobre bootstrap al
-- final.
--
-- APLICACIÓN
-- Pegar en el SQL Editor de Supabase. Es idempotente.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Alta automática de perfil
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER porque el trigger corre en el contexto de `auth.users`, que
-- no tiene permisos sobre `public.profiles`.
-- `search_path` fijo para evitar secuestro por un esquema del llamador.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'solo_lectura')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. Backfill de usuarios ya existentes
-- ---------------------------------------------------------------------------

insert into public.profiles (id, email, role)
select u.id, u.email, 'solo_lectura'
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Rol del usuario actual, para políticas RLS
-- ---------------------------------------------------------------------------
-- Todavía no se usa: la aplicación consulta con service role, que hace bypass
-- de RLS. Queda lista para la fase B, cuando las lecturas del backoffice pasen
-- al cliente de sesión.
--
-- Ejemplo de uso en una política:
--   create policy "operaciones puede leer empleados" on public.employees
--     for select using (public.current_user_role() in ('admin','operaciones'));

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Bootstrap del primer administrador
-- ---------------------------------------------------------------------------
-- Todos los perfiles nacen como `solo_lectura`, así que tras aplicar esto nadie
-- puede ejecutar acciones de escritura. Hay dos formas de promover al primero:
--
-- a) La variable de entorno BOOTSTRAP_ADMIN_EMAILS de la aplicación, que
--    promueve automáticamente a esos correos al iniciar sesión (recomendada:
--    queda versionada junto al resto de la configuración).
--
-- b) A mano, aquí:
--      update public.profiles set role = 'admin' where email = 'tu@correo.com';
--
-- Comprobar quién tiene cada rol:
--   select email, role from public.profiles order by role, email;
-- =============================================================================
