-- =============================================================================
-- Idempotencia por empleado en el envío masivo (auditoría §5b)
-- =============================================================================
--
-- CONTEXTO
-- El envío inline (sendBulkMessages) no deduplicaba por empleado: un doble
-- submit o un reintento reenviaba la plantilla a los mismos empleados (costo +
-- molestia + posible baja de calidad del número en Meta). El camino de cola ya
-- es idempotente (reclamo atómico por mensaje); esto cierra el inline.
--
-- QUÉ HACE
-- Añade una columna `dedup_key` y un índice ÚNICO PARCIAL sobre ella. La app,
-- antes de enviar, inserta una fila "reclamo" con
--   dedup_key = employee_id + ':' + plantilla + ':' + ventana_de_5min
-- Un segundo intento sobre el mismo empleado+plantilla dentro de la ventana
-- choca con el índice único (error 23505) y la app lo salta en vez de reenviar.
--
-- SEGURIDAD DE APLICARLA
-- El índice es PARCIAL (solo filas con dedup_key no nulo), así que las filas
-- existentes (dedup_key nulo) y las del camino de cola no se ven afectadas. La
-- app degrada con gracia: si esta migración aún no está aplicada, detecta la
-- ausencia de la columna y envía sin dedup (comportamiento anterior). Aplicarla
-- solo ACTIVA el dedup; no rompe nada.
--
-- APLICACIÓN
-- Pegar en el SQL Editor de Supabase. Es idempotente.
-- =============================================================================

alter table public.whatsapp_contract_messages
  add column if not exists dedup_key text;

create unique index if not exists uq_whatsapp_messages_dedup
  on public.whatsapp_contract_messages (dedup_key)
  where dedup_key is not null;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
-- La columna y el índice deben existir:
--   select column_name from information_schema.columns
--   where table_name = 'whatsapp_contract_messages' and column_name = 'dedup_key';
--   select indexname from pg_indexes where indexname = 'uq_whatsapp_messages_dedup';
-- =============================================================================
