-- Estado operativo `rechazado`: quien contestó que NO deja de verse igual que
-- quien no ha contestado.
--
-- El dato ya estaba bien: al tocar "No, gracias" el chatbot pone la oferta en
-- `rechazada` (`handleNo`). Pero el `operational_status` de esta vista no lo
-- miraba, así que el tablero mostraba `mensaje_enviado` tanto para quien dijo
-- que no como para quien nunca abrió el mensaje. En el ciclo del 23-sep eso
-- eran 5 y 11 personas indistinguibles en la misma fila, y la diferencia
-- importa: a los silenciosos se les reenvía la oferta, a los que dijeron que no
-- no se les molesta.
--
-- La rama va DESPUÉS de las de contrato: quien dijo que no y luego cambió de
-- opinión dentro de la ventana genera su contrato y su oferta pasa a
-- `solicitada`, así que el estado del contrato debe ganar. Y va ANTES de las de
-- mensaje, que solo miran si el envío salió.
--
-- Se usa CREATE OR REPLACE y no DROP + CREATE para no perder el
-- `security_invoker = on` que le puso 20260720_enable_rls_deny_all.sql; por eso
-- la definición se repite entera, sin cambiar ninguna columna ni su orden.

CREATE OR REPLACE VIEW public.backoffice_contract_control_v1 AS
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
    WHEN co.status = 'rechazada' THEN 'rechazado'
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
  'Vista principal del backoffice de contratos: a quién se le mandó WhatsApp, quién pidió, quién dijo que no, quién tiene enlace, quién firmó y cuándo. Los datos bancarios quedan fuera a propósito.';
