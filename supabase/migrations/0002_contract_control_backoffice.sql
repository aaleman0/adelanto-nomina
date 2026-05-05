-- Adelantos V1 - Contract control backoffice update
-- Paste this file in the Supabase SQL Editor after 0001_initial_schema.sql.
--
-- Goal:
-- - Keep existing import/employee/offer/contract data.
-- - Add operational tracking for ManyChat message send/click.
-- - Add backoffice views focused only on message, contract, signature and times.
-- - Do not expose or manage bank account data from the backoffice views.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'manychat_contract_message_status'
      and n.nspname = 'public'
  ) then
    create type public.manychat_contract_message_status as enum (
      'pendiente_envio',
      'enviado',
      'entregado',
      'click',
      'error',
      'omitido'
    );
  end if;
end
$$;

create table if not exists public.manychat_contract_messages (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  offer_id uuid references public.advance_offers(id) on delete set null,
  manychat_contact_id uuid references public.manychat_contacts(id) on delete set null,
  contract_request_id uuid references public.contract_requests(id) on delete set null,
  manychat_subscriber_id text,
  message_type text not null default 'contract_offer',
  campaign_name text,
  flow_name text,
  status public.manychat_contract_message_status not null default 'pendiente_envio',
  sent_at timestamptz,
  delivered_at timestamptz,
  clicked_at timestamptz,
  error_message text,
  correlation_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.manychat_contract_messages is
  'Operational record of ManyChat messages related to contract offers. Used by backoffice to know who was sent a message, who clicked and when.';

comment on column public.manychat_contract_messages.status is
  'pendiente_envio=enqueued/not sent, enviado=sent, entregado=delivered if available, click=user clicked/requested, error=send/request failed, omitido=not sent intentionally.';

create index if not exists manychat_contract_messages_employee_created_idx
  on public.manychat_contract_messages (employee_id, created_at desc);

create index if not exists manychat_contract_messages_offer_idx
  on public.manychat_contract_messages (offer_id)
  where offer_id is not null;

create index if not exists manychat_contract_messages_status_idx
  on public.manychat_contract_messages (status);

create index if not exists manychat_contract_messages_sent_at_idx
  on public.manychat_contract_messages (sent_at desc)
  where sent_at is not null;

create index if not exists manychat_contract_messages_subscriber_idx
  on public.manychat_contract_messages (manychat_subscriber_id)
  where manychat_subscriber_id is not null;

create index if not exists manychat_contract_messages_request_idx
  on public.manychat_contract_messages (contract_request_id)
  where contract_request_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'manychat_contract_messages_set_updated_at'
  ) then
    create trigger manychat_contract_messages_set_updated_at
    before update on public.manychat_contract_messages
    for each row execute function public.set_updated_at();
  end if;
end
$$;

-- Backfill minimal click records for any contract requests created before this table existed.
-- This is safe to run multiple times because it checks by contract_request_id.
insert into public.manychat_contract_messages (
  employee_id,
  offer_id,
  contract_request_id,
  manychat_subscriber_id,
  message_type,
  status,
  clicked_at,
  correlation_id,
  metadata,
  created_at,
  updated_at
)
select
  cr.employee_id,
  cr.offer_id,
  cr.id,
  cr.manychat_subscriber_id,
  'contract_offer',
  'click'::public.manychat_contract_message_status,
  cr.requested_at,
  cr.id::text,
  jsonb_build_object('backfilled_from', 'contract_requests'),
  cr.created_at,
  cr.updated_at
from public.contract_requests cr
where cr.manychat_subscriber_id is not null
  and not exists (
    select 1
    from public.manychat_contract_messages m
    where m.contract_request_id = cr.id
  );

create or replace view public.backoffice_contract_control_v1 as
with current_offers as (
  select ao.*
  from public.advance_offers ao
  where ao.is_current = true
),
latest_attempts as (
  select distinct on (ca.contract_request_id)
    ca.*
  from public.contract_attempts ca
  order by ca.contract_request_id, ca.attempt_number desc, ca.created_at desc
),
latest_audit as (
  select distinct on (ae.employee_id)
    ae.employee_id,
    ae.event_name,
    ae.summary,
    ae.source,
    ae.created_at
  from public.audit_events ae
  where ae.employee_id is not null
  order by ae.employee_id, ae.created_at desc
)
select
  e.id as employee_id,
  co.id as offer_id,
  cr.id as contract_request_id,
  la.id as contract_attempt_id,
  e.nombre,
  e.apellidos,
  trim(concat_ws(' ', e.nombre, e.apellidos)) as empleado,
  e.rfc,
  e.telefono_normalizado,
  e.email,
  e.empleador,
  co.monto_prestamo_autorizado,
  co.is_eligible,
  co.status as offer_status,
  co.estatus_conversion,
  lm.id as manychat_message_id,
  coalesce(lm.status::text, 'pendiente_envio') as message_status,
  lm.sent_at as message_sent_at,
  lm.delivered_at as message_delivered_at,
  lm.clicked_at as message_clicked_at,
  lm.error_message as message_error,
  lm.manychat_subscriber_id,
  cr.status as contract_status,
  cr.requested_at as contract_requested_at,
  cr.signed_at as contract_signed_at,
  cr.error_message as contract_error,
  la.easylex_contract_id,
  la.signing_url,
  la.status as contract_attempt_status,
  la.generated_at as contract_generated_at,
  la.expires_at as link_expires_at,
  la.signed_at as attempt_signed_at,
  la.error_message as attempt_error,
  case
    when cr.status = 'firmado' or la.status = 'firmado' then 'firmado'
    when la.status = 'error' or cr.status = 'error' then 'error'
    when la.expires_at is not null and la.expires_at <= now() and la.status <> 'firmado' then 'link_expirado'
    when la.signing_url is not null then 'contrato_generado'
    when cr.status in ('recibida', 'generando') then 'contrato_en_proceso'
    when lm.status = 'click' then 'solicitado'
    when lm.status in ('enviado', 'entregado') then 'mensaje_enviado'
    when co.is_eligible then 'pendiente_envio'
    else 'no_elegible'
  end as operational_status,
  greatest(
    coalesce(la.signed_at, '-infinity'::timestamptz),
    coalesce(cr.signed_at, '-infinity'::timestamptz),
    coalesce(la.generated_at, '-infinity'::timestamptz),
    coalesce(cr.requested_at, '-infinity'::timestamptz),
    coalesce(lm.clicked_at, '-infinity'::timestamptz),
    coalesce(lm.delivered_at, '-infinity'::timestamptz),
    coalesce(lm.sent_at, '-infinity'::timestamptz),
    coalesce(co.updated_at, '-infinity'::timestamptz),
    e.updated_at
  ) as last_movement_at,
  latest_audit.event_name as last_audit_event,
  latest_audit.summary as last_audit_summary,
  latest_audit.source as last_audit_source,
  latest_audit.created_at as last_audit_at
from public.employees e
left join current_offers co on co.employee_id = e.id
left join lateral (
  select m.*
  from public.manychat_contract_messages m
  where m.employee_id = e.id
    and (m.offer_id = co.id or m.offer_id is null)
  order by
    case when m.offer_id = co.id then 0 else 1 end,
    greatest(
      coalesce(m.clicked_at, '-infinity'::timestamptz),
      coalesce(m.delivered_at, '-infinity'::timestamptz),
      coalesce(m.sent_at, '-infinity'::timestamptz),
      m.created_at
    ) desc
  limit 1
) lm on true
left join public.contract_requests cr
  on cr.employee_id = e.id
  and cr.offer_id = co.id
left join latest_attempts la on la.contract_request_id = cr.id
left join latest_audit on latest_audit.employee_id = e.id;

comment on view public.backoffice_contract_control_v1 is
  'Main internal backoffice view for contract operations: who was sent a ManyChat message, who requested, who has a contract link, who signed and when. Bank data intentionally excluded.';

create or replace view public.backoffice_contract_timeline_v1 as
select
  ae.employee_id,
  ae.entity_type,
  ae.entity_id,
  ae.created_at as occurred_at,
  ae.source::text as source,
  ae.event_name as event_type,
  ae.new_state as status,
  ae.summary,
  ae.metadata
from public.audit_events ae
where ae.employee_id is not null

union all

select
  m.employee_id,
  'manychat_contract_message' as entity_type,
  m.id as entity_id,
  coalesce(m.clicked_at, m.delivered_at, m.sent_at, m.created_at) as occurred_at,
  'manychat' as source,
  'manychat_contract_message_' || m.status::text as event_type,
  m.status::text as status,
  case
    when m.status = 'click' then 'El empleado hizo clic en Solicitalo aqui.'
    when m.status in ('enviado', 'entregado') then 'Mensaje de contrato enviado por ManyChat.'
    when m.status = 'error' then coalesce(m.error_message, 'Error en mensaje ManyChat.')
    else 'Mensaje ManyChat registrado.'
  end as summary,
  jsonb_build_object(
    'manychat_subscriber_id', m.manychat_subscriber_id,
    'campaign_name', m.campaign_name,
    'flow_name', m.flow_name,
    'contract_request_id', m.contract_request_id
  ) || m.metadata as metadata
from public.manychat_contract_messages m

union all

select
  cr.employee_id,
  'contract_request' as entity_type,
  cr.id as entity_id,
  cr.created_at as occurred_at,
  'backend' as source,
  'contract_request_' || cr.status::text as event_type,
  cr.status::text as status,
  case
    when cr.status = 'recibida' then 'Solicitud de contrato recibida.'
    when cr.status = 'generando' then 'Contrato en generacion.'
    when cr.status = 'link_generado' then 'Contrato generado con link de firma.'
    when cr.status = 'firmado' then 'Contrato firmado.'
    when cr.status = 'error' then coalesce(cr.error_message, 'Error en solicitud de contrato.')
    else 'Solicitud de contrato actualizada.'
  end as summary,
  jsonb_build_object(
    'offer_id', cr.offer_id,
    'manychat_subscriber_id', cr.manychat_subscriber_id,
    'requested_at', cr.requested_at,
    'signed_at', cr.signed_at
  ) as metadata
from public.contract_requests cr

union all

select
  cr.employee_id,
  'contract_attempt' as entity_type,
  ca.id as entity_id,
  ca.created_at as occurred_at,
  'easylex' as source,
  'contract_attempt_' || ca.status::text as event_type,
  ca.status::text as status,
  case
    when ca.status = 'generando' then 'Intento de contrato iniciado.'
    when ca.status = 'generado' then 'Link de firma generado.'
    when ca.status = 'expirado' then 'Link de firma expirado.'
    when ca.status = 'firmado' then 'Firma confirmada.'
    when ca.status = 'error' then coalesce(ca.error_message, 'Error generando link de firma.')
    else 'Intento de contrato actualizado.'
  end as summary,
  jsonb_build_object(
    'contract_request_id', ca.contract_request_id,
    'attempt_number', ca.attempt_number,
    'easylex_contract_id', ca.easylex_contract_id,
    'generated_at', ca.generated_at,
    'expires_at', ca.expires_at,
    'signed_at', ca.signed_at
  ) as metadata
from public.contract_attempts ca
join public.contract_requests cr on cr.id = ca.contract_request_id;

comment on view public.backoffice_contract_timeline_v1 is
  'Unified timeline for internal contract operations. Focused on imports, ManyChat message, contract generation, link expiration and signature.';

-- Optional but useful for manual checks in the Supabase SQL Editor:
-- select * from public.backoffice_contract_control_v1 order by last_movement_at desc nulls last limit 50;
-- select * from public.backoffice_contract_timeline_v1 where employee_id = '<employee_id>' order by occurred_at desc;
