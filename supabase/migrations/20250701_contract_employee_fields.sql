-- Migration: Add employee personal fields for contract generation + company_settings table

-- ─── New columns on employees ───

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS apellido_paterno text,
  ADD COLUMN IF NOT EXISTS apellido_materno text,
  ADD COLUMN IF NOT EXISTS estado_civil text,
  ADD COLUMN IF NOT EXISTS nacionalidad text,
  ADD COLUMN IF NOT EXISTS lugar_origen text,
  ADD COLUMN IF NOT EXISTS fecha_nacimiento date,
  ADD COLUMN IF NOT EXISTS domicilio text;

-- Migrate existing data: split apellidos → apellido_paterno + apellido_materno
UPDATE public.employees
SET
  apellido_paterno = split_part(coalesce(apellidos, ''), ' ', 1),
  apellido_materno = CASE
    WHEN position(' ' in coalesce(apellidos, '')) > 0
    THEN substring(apellidos from position(' ' in apellidos) + 1)
    ELSE split_part(coalesce(apellidos, ''), ' ', 1)
  END
WHERE apellidos IS NOT NULL
  AND apellido_paterno IS NULL;

-- ─── Company settings table ───

CREATE TABLE IF NOT EXISTS public.company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text NOT NULL DEFAULT '',
  description text,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_company_settings_updated_at
  BEFORE UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed initial company settings (acreedor data + testigos)
INSERT INTO public.company_settings (key, value, description) VALUES
  ('acreedor_razon_social', 'LOZAV CONSTRUCTORES, SOCIEDAD ANÓNIMA DE CAPITAL VARIABLE', 'Razón social del acreedor'),
  ('acreedor_representante', 'DARA JAHDAI LOPEZ DE LOS ANGELES', 'Representante legal del acreedor'),
  ('acreedor_rfc', 'LCO2105032T5', 'RFC del acreedor'),
  ('acreedor_domicilio', 'Del Gran Parque número 225, Interior C, colonia Cumbres, C.P. 64610, Monterrey, Nuevo León', 'Domicilio fiscal del acreedor'),
  ('acreedor_banco', '', 'Banco del acreedor (LLENAR)'),
  ('acreedor_cuenta', '', 'Número de cuenta del acreedor (LLENAR)'),
  ('acreedor_clabe', '', 'CLABE interbancaria del acreedor (LLENAR)'),
  ('testigo_1_nombre', '', 'Nombre completo del testigo 1 (LLENAR)'),
  ('testigo_2_nombre', '', 'Nombre completo del testigo 2 (LLENAR)')
ON CONFLICT (key) DO NOTHING;
