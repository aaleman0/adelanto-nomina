-- Adelantos V1 - Supabase initial schema
-- Phase 1: enums, tables, constraints, indexes, triggers, and storage buckets.

create extension if not exists pgcrypto;

create type public.import_status as enum (
  'recibida',
  'validando',
  'aplicada',
  'aplicada_con_errores',
  'fallida'
);

create type public.row_status as enum (
  'pendiente',
  'valida',
  'invalida',
  'duplicada',
  'sin_cambios',
  'aplicada'
);

create type public.offer_status as enum (
  'vigente',
  'reemplazada',
  'solicitada',
  'firmada',
  'rechazada'
);

create type public.contract_request_status as enum (
  'recibida',
  'generando',
  'link_generado',
  'firmado',
  'error'
);

create type public.contract_attempt_status as enum (
  'generando',
  'generado',
  'expirado',
  'firmado',
  'error'
);

create type public.integration_status as enum (
  'pending',
  'success',
  'failed',
  'retrying'
);

create type public.integration_provider as enum (
  'manychat',
  'easylex',
  'supabase',
  'backend'
);

create type public.integration_direction as enum (
  'inbound',
  'outbound',
  'internal'
);

create type public.audit_source as enum (
  'csv',
  'manychat',
  'backend',
  'easylex',
  'backoffice',
  'system'
);

create type public.user_role as enum (
  'admin',
  'operaciones',
  'solo_lectura'
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role public.user_role not null default 'solo_lectura',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  storage_bucket text not null default 'imports',
  storage_path text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  status public.import_status not null default 'recibida',
  total_rows integer not null default 0 check (total_rows >= 0),
  valid_rows integer not null default 0 check (valid_rows >= 0),
  invalid_rows integer not null default 0 check (invalid_rows >= 0),
  duplicate_rows integer not null default 0 check (duplicate_rows >= 0),
  unchanged_rows integer not null default 0 check (unchanged_rows >= 0),
  changed_rows integer not null default 0 check (changed_rows >= 0),
  applied_rows integer not null default 0 check (applied_rows >= 0),
  error_summary jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  applied_at timestamptz
);

create table public.raw_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  row_number integer not null check (row_number > 0),
  raw_payload jsonb not null,
  normalized_payload jsonb not null default '{}'::jsonb,
  row_hash text,
  rfc text,
  telefono_normalizado text,
  clabe_last4 text,
  status public.row_status not null default 'pendiente',
  errors jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint raw_import_rows_batch_row_unique unique (batch_id, row_number)
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  rfc text not null,
  curp text,
  nombre text not null,
  apellidos text,
  cp_csf text,
  telefono text not null,
  telefono_normalizado text not null,
  email text,
  empleador text,
  source_batch_id uuid references public.import_batches(id) on delete set null,
  source_row_id uuid references public.raw_import_rows(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employees_rfc_unique unique (rfc),
  constraint employees_rfc_format check (rfc = upper(trim(rfc)) and length(rfc) between 12 and 13),
  constraint employees_curp_format check (curp is null or (curp = upper(trim(curp)) and length(curp) = 18)),
  constraint employees_phone_normalized_format check (telefono_normalizado ~ '^[0-9]{10,15}$')
);

create table public.employee_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  clabe text not null,
  clabe_last4 text generated always as (right(clabe, 4)) stored,
  banco text not null,
  is_active boolean not null default true,
  source_batch_id uuid references public.import_batches(id) on delete set null,
  source_row_id uuid references public.raw_import_rows(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_bank_accounts_clabe_format check (clabe ~ '^[0-9]{18}$')
);

create table public.advance_offers (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  monto_prestamo_autorizado numeric(12, 2) not null check (monto_prestamo_autorizado >= 0),
  estatus_p_esta_q text,
  estatus_conversion text not null,
  estatus_cliente text,
  is_eligible boolean generated always as (estatus_conversion = 'aceptada') stored,
  is_current boolean not null default true,
  status public.offer_status not null default 'vigente',
  source_batch_id uuid references public.import_batches(id) on delete set null,
  source_row_id uuid references public.raw_import_rows(id) on delete set null,
  replaced_by_offer_id uuid references public.advance_offers(id) on delete set null,
  source_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint advance_offers_estatus_conversion_check check (estatus_conversion in ('aceptada', 'rechazada')),
  constraint advance_offers_replaced_not_self check (replaced_by_offer_id is null or replaced_by_offer_id <> id)
);

create table public.advance_offer_revisions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  previous_offer_id uuid references public.advance_offers(id) on delete set null,
  new_offer_id uuid references public.advance_offers(id) on delete set null,
  batch_id uuid references public.import_batches(id) on delete set null,
  row_id uuid references public.raw_import_rows(id) on delete set null,
  previous_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  change_hash text not null,
  created_at timestamptz not null default now()
);

create table public.manychat_contacts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete set null,
  subscriber_id text not null,
  telefono_normalizado text,
  first_name text,
  last_name text,
  metadata jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint manychat_contacts_subscriber_unique unique (subscriber_id)
);

create table public.contract_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  offer_id uuid not null references public.advance_offers(id) on delete restrict,
  status public.contract_request_status not null default 'recibida',
  requested_from text not null default 'manychat',
  manychat_subscriber_id text,
  contract_snapshot jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default now(),
  signed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_requests_offer_unique unique (offer_id)
);

create table public.contract_attempts (
  id uuid primary key default gen_random_uuid(),
  contract_request_id uuid not null references public.contract_requests(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  easylex_contract_id text,
  signing_url text,
  status public.contract_attempt_status not null default 'generando',
  expires_at timestamptz,
  generated_at timestamptz,
  signed_at timestamptz,
  error_message text,
  raw_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_attempts_request_attempt_unique unique (contract_request_id, attempt_number)
);

create table public.easylex_events (
  id uuid primary key default gen_random_uuid(),
  contract_request_id uuid references public.contract_requests(id) on delete set null,
  contract_attempt_id uuid references public.contract_attempts(id) on delete set null,
  easylex_contract_id text,
  event_id text,
  event_type text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  status public.integration_status not null default 'pending',
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.integration_logs (
  id uuid primary key default gen_random_uuid(),
  provider public.integration_provider not null,
  direction public.integration_direction not null,
  endpoint text,
  method text,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  status_code integer,
  status public.integration_status not null default 'pending',
  success boolean not null default false,
  error_message text,
  correlation_id text,
  entity_type text,
  entity_id uuid,
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  entity_type text,
  entity_id uuid,
  employee_id uuid references public.employees(id) on delete set null,
  correlation_id text,
  source public.audit_source not null default 'system',
  previous_state text,
  new_state text,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  actor_type text,
  actor_id uuid,
  created_at timestamptz not null default now()
);

create unique index employees_curp_unique_idx
  on public.employees (curp)
  where curp is not null;

create index employees_telefono_normalizado_idx
  on public.employees (telefono_normalizado);

create index employees_email_idx
  on public.employees (email)
  where email is not null;

create unique index employee_bank_accounts_one_active_idx
  on public.employee_bank_accounts (employee_id)
  where is_active;

create unique index advance_offers_one_current_per_employee_idx
  on public.advance_offers (employee_id)
  where is_current;

create index advance_offers_employee_status_idx
  on public.advance_offers (employee_id, status);

create index advance_offers_estatus_conversion_idx
  on public.advance_offers (estatus_conversion);

create index advance_offers_is_eligible_idx
  on public.advance_offers (is_eligible);

create index raw_import_rows_batch_status_idx
  on public.raw_import_rows (batch_id, status);

create index raw_import_rows_rfc_idx
  on public.raw_import_rows (rfc)
  where rfc is not null;

create index manychat_contacts_employee_idx
  on public.manychat_contacts (employee_id);

create index manychat_contacts_phone_idx
  on public.manychat_contacts (telefono_normalizado)
  where telefono_normalizado is not null;

create unique index contract_requests_one_active_per_employee_idx
  on public.contract_requests (employee_id)
  where status in ('recibida', 'generando', 'link_generado');

create index contract_requests_status_idx
  on public.contract_requests (status);

create unique index contract_attempts_easylex_contract_unique_idx
  on public.contract_attempts (easylex_contract_id)
  where easylex_contract_id is not null;

create index contract_attempts_request_status_idx
  on public.contract_attempts (contract_request_id, status);

create index contract_attempts_expires_at_idx
  on public.contract_attempts (expires_at)
  where expires_at is not null;

create unique index easylex_events_event_id_unique_idx
  on public.easylex_events (event_id)
  where event_id is not null;

create index easylex_events_contract_idx
  on public.easylex_events (easylex_contract_id)
  where easylex_contract_id is not null;

create index integration_logs_provider_created_idx
  on public.integration_logs (provider, created_at desc);

create index integration_logs_correlation_idx
  on public.integration_logs (correlation_id)
  where correlation_id is not null;

create index audit_events_employee_created_idx
  on public.audit_events (employee_id, created_at desc);

create index audit_events_entity_idx
  on public.audit_events (entity_type, entity_id)
  where entity_type is not null and entity_id is not null;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger import_batches_set_updated_at
before update on public.import_batches
for each row execute function public.set_updated_at();

create trigger raw_import_rows_set_updated_at
before update on public.raw_import_rows
for each row execute function public.set_updated_at();

create trigger employees_set_updated_at
before update on public.employees
for each row execute function public.set_updated_at();

create trigger employee_bank_accounts_set_updated_at
before update on public.employee_bank_accounts
for each row execute function public.set_updated_at();

create trigger advance_offers_set_updated_at
before update on public.advance_offers
for each row execute function public.set_updated_at();

create trigger manychat_contacts_set_updated_at
before update on public.manychat_contacts
for each row execute function public.set_updated_at();

create trigger contract_requests_set_updated_at
before update on public.contract_requests
for each row execute function public.set_updated_at();

create trigger contract_attempts_set_updated_at
before update on public.contract_attempts
for each row execute function public.set_updated_at();

create trigger easylex_events_set_updated_at
before update on public.easylex_events
for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'imports',
    'imports',
    false,
    52428800,
    array[
      'text/csv',
      'application/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
  ),
  (
    'import-reports',
    'import-reports',
    false,
    10485760,
    array[
      'text/csv',
      'application/json',
      'text/plain'
    ]
  )
on conflict (id) do nothing;
