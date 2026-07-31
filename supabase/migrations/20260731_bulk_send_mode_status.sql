-- Arregla un 500 del cockpit: el envío en lote por etapa usa mode='status',
-- pero el CHECK original de whatsapp_bulk_sends solo permitía ('import','manual').
-- Insertar mode='status' violaba el constraint (23514) → el insert lanzaba → 500.
--
-- (Ver src/lib/whatsapp/bulk-send.ts: hay una rama explícita para mode==='status'.)

alter table public.whatsapp_bulk_sends
  drop constraint if exists whatsapp_bulk_sends_mode_check;

alter table public.whatsapp_bulk_sends
  add constraint whatsapp_bulk_sends_mode_check
  check (mode in ('import', 'manual', 'status'));
