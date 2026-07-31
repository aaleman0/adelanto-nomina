-- Archivo del contrato FIRMADO y su entrega al empleado.
--
-- Tras confirmar la firma (webhook de EasyLex), la app descarga el PDF firmado,
-- lo guarda aquí y se lo manda al empleado por WhatsApp. Este bucket es la copia
-- de respaldo del lado nuestro y la fuente de la signed URL que se envía.

-- Bucket privado (sin acceso anónimo). El servidor (service role) sube y genera
-- signed URLs temporales; el empleado nunca accede directo al bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contratos-firmados',
  'contratos-firmados',
  false,
  26214400, -- 25 MB
  array['application/pdf']
)
on conflict (id) do nothing;

-- Ruta del PDF firmado dentro del bucket, para poder recuperarlo/mostrarlo desde
-- el backoffice sin volver a pegarle a EasyLex.
alter table public.contract_attempts
  add column if not exists signed_pdf_path text;

comment on column public.contract_attempts.signed_pdf_path is
  'Ruta en el bucket contratos-firmados del PDF firmado archivado tras la confirmación de firma.';
