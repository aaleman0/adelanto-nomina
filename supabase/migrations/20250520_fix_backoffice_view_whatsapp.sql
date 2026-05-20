-- ============================================================
-- Fix: Actualizar vista backoffice_contract_control_v1
-- para usar whatsapp_contract_messages en lugar de
-- manychat_contract_messages (renombrada en 20250516_whatsapp_migration.sql)
-- y exponer whatsapp_subscriber_id en lugar de manychat_subscriber_id.
-- También actualiza backoffice_contract_timeline_v1.
-- ============================================================
-- INSTRUCCIONES: Ejecutar en Supabase SQL Editor.
-- ============================================================

-- Actualizar vista principal de control de contratos
drop view if exists public.backoffice_contract_control_v1 cascade;
create view public.backoffice_contract_control_v1 as
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
  lm.id as whatsapp_message_id,
  coalesce(lm.status::text, 'pendiente_envio')::text as message_status,
  lm.created_at as message_sent_at,
  lm.delivered_at as message_delivered_at,
  lm.clicked_at as message_clicked_at,
  lm.error_message as message_error,
  lm.whatsapp_subscriber_id,
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
    when lm.status::text = 'click' then 'solicitado'
    when lm.status::text in ('enviado', 'entregado') then 'mensaje_enviado'
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
    coalesce(lm.created_at, '-infinity'::timestamptz),
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
  from public.whatsapp_contract_messages m
  where m.employee_id = e.id
    and (m.offer_id = co.id or m.offer_id is null)
  order by
    case when m.offer_id = co.id then 0 else 1 end,
    greatest(
      coalesce(m.clicked_at, '-infinity'::timestamptz),
      coalesce(m.delivered_at, '-infinity'::timestamptz),
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
  'Main internal backoffice view for contract operations: who was sent a WhatsApp message, who requested, who has a contract link, who signed and when. Bank data intentionally excluded.';

-- Actualizar vista de timeline de contratos
drop view if exists public.backoffice_contract_timeline_v1;
create view public.backoffice_contract_timeline_v1 as
select
  ae.employee_id,
  ae.entity_type,
  ae.entity_id,
  ae.created_at as occurred_at,
  ae.source::text as source,
  ae.event_name as event_type,
  ae.new_state::text as status,
  ae.summary,
  ae.metadata
from public.audit_events ae
where ae.employee_id is not null

union all

select
  m.employee_id,
  'whatsapp_contract_message' as entity_type,
  m.id as entity_id,
  coalesce(m.clicked_at, m.delivered_at, m.created_at) as occurred_at,
  'whatsapp' as source,
  'whatsapp_contract_message_' || coalesce(m.status::text, 'unknown') as event_type,
  m.status::text as status,
  case
    when m.status::text = 'click' then 'El empleado hizo clic en Solicitalo aqui.'
    when m.status::text in ('enviado', 'entregado') then 'Mensaje de contrato enviado por WhatsApp.'
    when m.status::text = 'error' then coalesce(m.error_message, 'Error en mensaje WhatsApp.')
    else 'Mensaje WhatsApp registrado.'
  end as summary,
  jsonb_build_object(
    'whatsapp_subscriber_id', m.whatsapp_subscriber_id,
    'wa_message_id', m.wa_message_id,
    'bulk_send_id', m.bulk_send_id,
    'contract_request_id', m.contract_request_id
  ) || coalesce(m.metadata, '{}'::jsonb) as metadata
from public.whatsapp_contract_messages m

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
  'Unified timeline for internal contract operations. Focused on imports, WhatsApp message, contract generation, link expiration and signature.';
