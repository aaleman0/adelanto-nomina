-- ============================================================
-- Fix: Alinear whatsapp_contract_messages.status con migración WhatsApp
-- ============================================================
-- Contexto:
-- - Instalaciones migradas desde ManyChat pueden conservar
--   whatsapp_contract_messages.status como enum manychat_contract_message_status.
-- - El código actual de WhatsApp registra estados en inglés como
--   'sent' y 'failed'.
-- - La migración WhatsApp 20250516 define status como TEXT para
--   instalaciones nuevas.
-- ============================================================

DROP VIEW IF EXISTS public.backoffice_contract_timeline_v1;
DROP VIEW IF EXISTS public.backoffice_contract_control_v1 CASCADE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'whatsapp_contract_messages'
      AND column_name = 'status'
      AND udt_name = 'manychat_contract_message_status'
  ) THEN
    ALTER TABLE public.whatsapp_contract_messages
      ALTER COLUMN status DROP DEFAULT;

    ALTER TABLE public.whatsapp_contract_messages
      ALTER COLUMN status TYPE text
      USING status::text;

    ALTER TABLE public.whatsapp_contract_messages
      ALTER COLUMN status DROP NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'whatsapp_contract_messages'
      AND column_name = 'status'
      AND data_type <> 'text'
  ) THEN
    ALTER TABLE public.whatsapp_contract_messages
      ALTER COLUMN status DROP DEFAULT;

    ALTER TABLE public.whatsapp_contract_messages
      ALTER COLUMN status TYPE text
      USING status::text;

    ALTER TABLE public.whatsapp_contract_messages
      ALTER COLUMN status DROP NOT NULL;
  END IF;
END $$;

ALTER TABLE public.whatsapp_contract_messages
  ALTER COLUMN status DROP DEFAULT;

ALTER TABLE public.whatsapp_contract_messages
  ALTER COLUMN status DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'whatsapp_contract_messages'
      AND column_name = 'delivery_status'
  ) THEN
    ALTER TABLE public.whatsapp_contract_messages
      ADD COLUMN delivery_status text DEFAULT 'sent';
  END IF;
END $$;

ALTER TABLE public.whatsapp_contract_messages
  ALTER COLUMN delivery_status SET DEFAULT 'sent';

CREATE VIEW public.backoffice_contract_control_v1 AS
WITH current_offers AS (
  SELECT ao.*
  FROM public.advance_offers ao
  WHERE ao.is_current = true
),
latest_attempts AS (
  SELECT DISTINCT ON (ca.contract_request_id)
    ca.*
  FROM public.contract_attempts ca
  ORDER BY ca.contract_request_id, ca.attempt_number DESC, ca.created_at DESC
),
latest_audit AS (
  SELECT DISTINCT ON (ae.employee_id)
    ae.employee_id,
    ae.event_name,
    ae.summary,
    ae.source,
    ae.created_at
  FROM public.audit_events ae
  WHERE ae.employee_id IS NOT NULL
  ORDER BY ae.employee_id, ae.created_at DESC
)
SELECT
  e.id AS employee_id,
  co.id AS offer_id,
  cr.id AS contract_request_id,
  la.id AS contract_attempt_id,
  e.nombre,
  e.apellidos,
  trim(concat_ws(' ', e.nombre, e.apellidos)) AS empleado,
  e.rfc,
  e.telefono_normalizado,
  e.email,
  e.empleador,
  co.monto_prestamo_autorizado,
  co.is_eligible,
  co.status AS offer_status,
  co.estatus_conversion,
  lm.id AS whatsapp_message_id,
  coalesce(lm.status, 'pendiente_envio') AS message_status,
  lm.created_at AS message_sent_at,
  lm.delivered_at AS message_delivered_at,
  lm.clicked_at AS message_clicked_at,
  lm.error_message AS message_error,
  lm.whatsapp_subscriber_id,
  cr.status AS contract_status,
  cr.requested_at AS contract_requested_at,
  cr.signed_at AS contract_signed_at,
  cr.error_message AS contract_error,
  la.easylex_contract_id,
  la.signing_url,
  la.status AS contract_attempt_status,
  la.generated_at AS contract_generated_at,
  la.expires_at AS link_expires_at,
  la.signed_at AS attempt_signed_at,
  la.error_message AS attempt_error,
  CASE
    WHEN cr.status = 'firmado' OR la.status = 'firmado' THEN 'firmado'
    WHEN la.status = 'error' OR cr.status = 'error' THEN 'error'
    WHEN la.expires_at IS NOT NULL AND la.expires_at <= now() AND la.status <> 'firmado' THEN 'link_expirado'
    WHEN la.signing_url IS NOT NULL THEN 'contrato_generado'
    WHEN cr.status IN ('recibida', 'generando') THEN 'contrato_en_proceso'
    WHEN lm.status = 'click' THEN 'solicitado'
    WHEN lm.status IN ('sent', 'enviado', 'delivered', 'entregado', 'read') THEN 'mensaje_enviado'
    WHEN co.is_eligible THEN 'pendiente_envio'
    ELSE 'no_elegible'
  END AS operational_status,
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
  ) AS last_movement_at,
  latest_audit.event_name AS last_audit_event,
  latest_audit.summary AS last_audit_summary,
  latest_audit.source AS last_audit_source,
  latest_audit.created_at AS last_audit_at
FROM public.employees e
LEFT JOIN current_offers co ON co.employee_id = e.id
LEFT JOIN LATERAL (
  SELECT m.*
  FROM public.whatsapp_contract_messages m
  WHERE m.employee_id = e.id
    AND (m.offer_id = co.id OR m.offer_id IS NULL)
  ORDER BY
    CASE WHEN m.offer_id = co.id THEN 0 ELSE 1 END,
    greatest(
      coalesce(m.clicked_at, '-infinity'::timestamptz),
      coalesce(m.delivered_at, '-infinity'::timestamptz),
      m.created_at
    ) DESC
  LIMIT 1
) lm ON true
LEFT JOIN public.contract_requests cr
  ON cr.employee_id = e.id
  AND cr.offer_id = co.id
LEFT JOIN latest_attempts la ON la.contract_request_id = cr.id
LEFT JOIN latest_audit ON latest_audit.employee_id = e.id;

COMMENT ON VIEW public.backoffice_contract_control_v1 IS
  'Main internal backoffice view for contract operations: who was sent a WhatsApp message, who requested, who has a contract link, who signed and when. Bank data intentionally excluded.';

CREATE VIEW public.backoffice_contract_timeline_v1 AS
SELECT
  ae.employee_id,
  ae.entity_type,
  ae.entity_id,
  ae.created_at AS occurred_at,
  ae.source::text AS source,
  ae.event_name AS event_type,
  ae.new_state::text AS status,
  ae.summary,
  ae.metadata
FROM public.audit_events ae
WHERE ae.employee_id IS NOT NULL

UNION ALL

SELECT
  m.employee_id,
  'whatsapp_contract_message' AS entity_type,
  m.id AS entity_id,
  coalesce(m.clicked_at, m.delivered_at, m.created_at) AS occurred_at,
  'whatsapp' AS source,
  'whatsapp_contract_message_' || coalesce(m.status, 'unknown') AS event_type,
  m.status AS status,
  CASE
    WHEN m.status = 'click' THEN 'El empleado hizo clic en Solicitalo aqui.'
    WHEN m.status IN ('sent', 'enviado', 'delivered', 'entregado', 'read') THEN 'Mensaje de contrato enviado por WhatsApp.'
    WHEN m.status IN ('failed', 'error') THEN coalesce(m.error_message, 'Error en mensaje WhatsApp.')
    ELSE 'Mensaje WhatsApp registrado.'
  END AS summary,
  jsonb_build_object(
    'whatsapp_subscriber_id', m.whatsapp_subscriber_id,
    'wa_message_id', m.wa_message_id,
    'bulk_send_id', m.bulk_send_id,
    'contract_request_id', m.contract_request_id
  ) || coalesce(m.metadata, '{}'::jsonb) AS metadata
FROM public.whatsapp_contract_messages m

UNION ALL

SELECT
  cr.employee_id,
  'contract_request' AS entity_type,
  cr.id AS entity_id,
  cr.created_at AS occurred_at,
  'backend' AS source,
  'contract_request_' || cr.status::text AS event_type,
  cr.status::text AS status,
  CASE
    WHEN cr.status = 'recibida' THEN 'Solicitud de contrato recibida.'
    WHEN cr.status = 'generando' THEN 'Contrato en generacion.'
    WHEN cr.status = 'link_generado' THEN 'Contrato generado con link de firma.'
    WHEN cr.status = 'firmado' THEN 'Contrato firmado.'
    WHEN cr.status = 'error' THEN coalesce(cr.error_message, 'Error en solicitud de contrato.')
    ELSE 'Solicitud de contrato actualizada.'
  END AS summary,
  jsonb_build_object(
    'offer_id', cr.offer_id,
    'manychat_subscriber_id', cr.manychat_subscriber_id,
    'requested_at', cr.requested_at,
    'signed_at', cr.signed_at
  ) AS metadata
FROM public.contract_requests cr

UNION ALL

SELECT
  cr.employee_id,
  'contract_attempt' AS entity_type,
  ca.id AS entity_id,
  ca.created_at AS occurred_at,
  'easylex' AS source,
  'contract_attempt_' || ca.status::text AS event_type,
  ca.status::text AS status,
  CASE
    WHEN ca.status = 'generando' THEN 'Intento de contrato iniciado.'
    WHEN ca.status = 'generado' THEN 'Link de firma generado.'
    WHEN ca.status = 'expirado' THEN 'Link de firma expirado.'
    WHEN ca.status = 'firmado' THEN 'Firma confirmada.'
    WHEN ca.status = 'error' THEN coalesce(ca.error_message, 'Error generando link de firma.')
    ELSE 'Intento de contrato actualizado.'
  END AS summary,
  jsonb_build_object(
    'contract_request_id', ca.contract_request_id,
    'attempt_number', ca.attempt_number,
    'easylex_contract_id', ca.easylex_contract_id,
    'generated_at', ca.generated_at,
    'expires_at', ca.expires_at,
    'signed_at', ca.signed_at
  ) AS metadata
FROM public.contract_attempts ca
JOIN public.contract_requests cr ON cr.id = ca.contract_request_id;

COMMENT ON VIEW public.backoffice_contract_timeline_v1 IS
  'Unified timeline for internal contract operations. Focused on imports, WhatsApp message, contract generation, link expiration and signature.';
