-- Migración: Extensiones para el flujo WhatsApp Cloud API
-- - Extender enums integration_provider y audit_source con 'whatsapp'
-- - Añadir columna whatsapp_subscriber_id a contract_requests
-- Pendiente de aplicar al Supabase remoto.

-- 1. Extender enum integration_provider para incluir 'whatsapp'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'integration_provider'::regtype
      AND enumlabel = 'whatsapp'
  ) THEN
    ALTER TYPE integration_provider ADD VALUE 'whatsapp';
  END IF;
END $$;

-- 2. Extender enum audit_source para incluir 'whatsapp'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'audit_source'::regtype
      AND enumlabel = 'whatsapp'
  ) THEN
    ALTER TYPE audit_source ADD VALUE 'whatsapp';
  END IF;
END $$;

-- 3. Añadir columna whatsapp_subscriber_id a contract_requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contract_requests'
      AND column_name = 'whatsapp_subscriber_id'
  ) THEN
    ALTER TABLE contract_requests ADD COLUMN whatsapp_subscriber_id TEXT;
    COMMENT ON COLUMN contract_requests.whatsapp_subscriber_id IS
      'ID del suscriptor de WhatsApp que originó la solicitud. Reemplaza manychat_subscriber_id.';
  END IF;
END $$;
