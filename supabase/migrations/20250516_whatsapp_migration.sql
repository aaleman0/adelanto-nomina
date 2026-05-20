-- ============================================================
-- Milestone 1: Migración de ManyChat → WhatsApp API
-- ============================================================
-- INSTRUCCIONES: Ejecutar este script en Supabase SQL Editor.
-- Es idempotente: usa IF NOT EXISTS / IF EXISTS / DO blocks.
-- ============================================================

-- -------------------------------------------------------
-- 1. Renombrar tablas (solo si aún tienen nombre antiguo)
-- -------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'manychat_contacts'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'whatsapp_contacts'
  ) THEN
    ALTER TABLE manychat_contacts RENAME TO whatsapp_contacts;
    RAISE NOTICE 'Tabla manychat_contacts renombrada a whatsapp_contacts';
  ELSE
    RAISE NOTICE 'Tabla whatsapp_contacts ya existe o manychat_contacts no existe. Nada que renombrar.';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'manychat_contract_messages'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'whatsapp_contract_messages'
  ) THEN
    ALTER TABLE manychat_contract_messages RENAME TO whatsapp_contract_messages;
    RAISE NOTICE 'Tabla manychat_contract_messages renombrada a whatsapp_contract_messages';
  ELSE
    RAISE NOTICE 'Tabla whatsapp_contract_messages ya existe o manychat_contract_messages no existe. Nada que renombrar.';
  END IF;
END $$;

-- -------------------------------------------------------
-- 2. Crear tabla whatsapp_contacts si no existe
--    (por si la migración es desde cero sin tablas previas)
-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS whatsapp_contacts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID NOT NULL,
  subscriber_id TEXT NOT NULL,
  wa_id         TEXT,
  telefono_normalizado TEXT,
  first_name    TEXT,
  last_name     TEXT,
  last_seen_at  TIMESTAMP WITH TIME ZONE,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata      JSONB,
  CONSTRAINT whatsapp_contacts_subscriber_id_key UNIQUE (subscriber_id)
);

-- -------------------------------------------------------
-- 3. Agregar columnas nuevas a whatsapp_contacts
-- -------------------------------------------------------

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whatsapp_contacts' AND column_name = 'wa_id'
  ) THEN
    ALTER TABLE whatsapp_contacts ADD COLUMN wa_id TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whatsapp_contacts' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE whatsapp_contacts ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
  END IF;
END $$;

-- -------------------------------------------------------
-- 4. Crear tabla whatsapp_contract_messages si no existe
-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS whatsapp_contract_messages (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id             UUID NOT NULL,
  offer_id                UUID,
  contract_request_id     UUID,
  whatsapp_subscriber_id  TEXT,
  message_type            TEXT NOT NULL DEFAULT 'contract_offer',
  status                  TEXT,
  bulk_send_id            UUID,
  wa_message_id           TEXT,
  delivery_status         TEXT DEFAULT 'sent',
  delivered_at            TIMESTAMP WITH TIME ZONE,
  read_at                 TIMESTAMP WITH TIME ZONE,
  error_message           TEXT,
  retry_count             INTEGER DEFAULT 0,
  clicked_at              TIMESTAMP WITH TIME ZONE,
  correlation_id          TEXT,
  metadata                JSONB,
  created_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- -------------------------------------------------------
-- 5. Agregar columnas nuevas a whatsapp_contract_messages
-- -------------------------------------------------------

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_contract_messages' AND column_name = 'bulk_send_id') THEN
    ALTER TABLE whatsapp_contract_messages ADD COLUMN bulk_send_id UUID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_contract_messages' AND column_name = 'wa_message_id') THEN
    ALTER TABLE whatsapp_contract_messages ADD COLUMN wa_message_id TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_contract_messages' AND column_name = 'delivery_status') THEN
    ALTER TABLE whatsapp_contract_messages ADD COLUMN delivery_status TEXT DEFAULT 'sent';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_contract_messages' AND column_name = 'delivered_at') THEN
    ALTER TABLE whatsapp_contract_messages ADD COLUMN delivered_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_contract_messages' AND column_name = 'read_at') THEN
    ALTER TABLE whatsapp_contract_messages ADD COLUMN read_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_contract_messages' AND column_name = 'error_message') THEN
    ALTER TABLE whatsapp_contract_messages ADD COLUMN error_message TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_contract_messages' AND column_name = 'retry_count') THEN
    ALTER TABLE whatsapp_contract_messages ADD COLUMN retry_count INTEGER DEFAULT 0;
  END IF;
END $$;

-- Renombrar columna manychat_subscriber_id → whatsapp_subscriber_id si existe
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_contract_messages' AND column_name = 'manychat_subscriber_id') THEN
    ALTER TABLE whatsapp_contract_messages RENAME COLUMN manychat_subscriber_id TO whatsapp_subscriber_id;
  END IF;
END $$;

-- -------------------------------------------------------
-- 6. Tabla para envíos masivos
-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS whatsapp_bulk_sends (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode            TEXT NOT NULL CHECK (mode IN ('import', 'manual')),
  import_id       UUID,
  employee_ids    TEXT[] NOT NULL DEFAULT '{}',
  eligible_count  INTEGER NOT NULL DEFAULT 0,
  sent_count      INTEGER DEFAULT 0,
  failed_count    INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  read_count      INTEGER DEFAULT 0,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by      TEXT,
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'completed', 'failed')),
  error_summary   TEXT
);

-- -------------------------------------------------------
-- 7. Tabla de configuración general (settings)
-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS settings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key        TEXT NOT NULL UNIQUE,
  value      TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- -------------------------------------------------------
-- 8. Función helper para incrementar contadores en bulk_sends
-- -------------------------------------------------------

CREATE OR REPLACE FUNCTION increment_bulk_send_counter(
  p_bulk_send_id UUID,
  p_field        TEXT
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_field = 'sent_count' THEN
    UPDATE whatsapp_bulk_sends SET sent_count = sent_count + 1 WHERE id = p_bulk_send_id;
  ELSIF p_field = 'failed_count' THEN
    UPDATE whatsapp_bulk_sends SET failed_count = failed_count + 1 WHERE id = p_bulk_send_id;
  ELSIF p_field = 'delivered_count' THEN
    UPDATE whatsapp_bulk_sends SET delivered_count = delivered_count + 1 WHERE id = p_bulk_send_id;
  ELSIF p_field = 'read_count' THEN
    UPDATE whatsapp_bulk_sends SET read_count = read_count + 1 WHERE id = p_bulk_send_id;
  END IF;
END;
$$;

-- -------------------------------------------------------
-- 9. Actualizar vista backoffice_contract_control_v1
--    para que use campos whatsapp_* en lugar de manychat_*
--    (solo si la vista existe y usa manychat_contract_messages)
-- -------------------------------------------------------

-- NOTA: Esta sección es un recordatorio. La vista deberá
-- actualizarse manualmente si referencia manychat_contract_messages
-- o manychat_contacts. Verifica con:
--   SELECT definition FROM pg_views WHERE viewname = 'backoffice_contract_control_v1';
-- Y si es necesario, recréala reemplazando referencias a manychat_*.

-- -------------------------------------------------------
-- 10. Indices útiles
-- -------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_employee_id
  ON whatsapp_contacts(employee_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_contract_messages_employee_id
  ON whatsapp_contract_messages(employee_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_contract_messages_bulk_send_id
  ON whatsapp_contract_messages(bulk_send_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_contract_messages_wa_message_id
  ON whatsapp_contract_messages(wa_message_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_bulk_sends_import_id
  ON whatsapp_bulk_sends(import_id);

-- -------------------------------------------------------
-- 11. Tabla de templates (Milestone 2)
-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_template_id TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'PENDING',
  category         TEXT NOT NULL DEFAULT 'UTILITY',
  language         TEXT NOT NULL DEFAULT 'es_MX',
  components       JSONB NOT NULL DEFAULT '[]',
  synced_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_name
  ON whatsapp_templates(name);

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_status
  ON whatsapp_templates(status);
