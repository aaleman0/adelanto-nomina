-- Migration: Add EasyLex validation/biometric settings

-- Default configuration for payroll advance contracts.
-- Biometric + liveness are enabled by default because the plan includes them.
-- Other validations are opt-in via company_settings.

INSERT INTO public.company_settings (key, value, description) VALUES
  ('easylex_validate_biometric', 'true', 'Activar validación biométrica facial en EasyLex'),
  ('easylex_validate_liveness', 'true', 'Activar prueba de vida (selfie) en EasyLex'),
  ('easylex_validate_id', 'false', 'Activar validación de identificación oficial en EasyLex'),
  ('easylex_validate_sms', 'false', 'Activar validación por SMS en EasyLex'),
  ('easylex_validate_picture', 'false', 'Activar validación por foto comparativa en EasyLex'),
  ('easylex_validate_email', 'false', 'Activar validación por email en EasyLex'),
  ('easylex_validate_voice', 'false', 'Activar validación por voz en EasyLex')
ON CONFLICT (key) DO NOTHING;
