# Sistema de Adelantos - Overview

## Entidades Base

- Base principal: Supabase Postgres.
- Autenticacion del backoffice: Supabase Auth.
- Archivos de importacion/evidencia: Supabase Storage cuando aplique.
- `import_batches`: archivo CSV recibido, usuario que cargo, fecha, estado y resumen.
- `raw_import_rows`: fila cruda, numero de fila, payload original, errores y batch.
- `employees`: identidad operativa del empleado.
- `advance_offers`: monto aprobado y vigencia por empleado.
- `manychat_contacts`: relacion entre empleado, telefono normalizado y subscriber_id.
- `contract_requests`: solicitud de contrato, estado, contract_id, signing_url y timestamps.
- `contract_events`: eventos recibidos desde EasyLex o generados por backend.
- `payments`: estado de dispersion, clave_cep, fecha_dispersion y referencia.
- `integration_logs`: llamadas a ManyChat, EasyLex y webhooks externos.
- `audit_events`: timeline humano de cambios importantes.

## Estados Recomendados

- Empleado: `activo`, `inactivo`, `bloqueado`.
- Oferta: `vigente`, `usada`, `expirada`, `cancelada`.
- Contrato: `sin_solicitud`, `solicitado`, `generando`, `generado`, `firmado`, `expirado`, `error`.
- Pago: `pendiente`, `en_proceso`, `pagado`, `fallido`, `cancelado`.
- Importacion: `recibida`, `validando`, `aplicada`, `aplicada_con_errores`, `fallida`.

## Eventos Clave

- `csv.imported`
- `employee.upserted`
- `manychat.contract_requested`
- `backend.eligibility_checked`
- `easylex.contract_created`
- `easylex.contract_signed`
- `payment.updated`
- `manychat.help_requested`
- `manychat.help_answered`
- `integration.error`

## Reglas Transversales

- Usar RFC como identificador principal del empleado.
- Usar telefono normalizado como identificador de contacto, no como identidad principal.
- Si dos filas comparten telefono, resolver identidad por RFC.
- Si el mismo RFC trae otro telefono, actualizar el telefono desde la importacion CSV mas reciente.
- Si un registro no aparece en un CSV nuevo, no tocarlo.
- Normalizar telefono antes de comparar.
- Considerar elegible para broadcast y solicitud solo a quien tenga `Estatus Conversión = Aceptada`.
- Tratar `Estatus Conversión = Rechazada` como no elegible para solicitud de adelanto.
- Mantener vivo el link de EasyLex por 2 horas desde su generacion.
- Permitir solo una solicitud por oferta vigente.
- No permitir mas de una solicitud activa por empleado.
- No cancelar solicitudes/contratos firmados.
- Si el link expira, permitir regenerar link como nuevo intento dentro de la misma solicitud.
- Congelar snapshot de contrato al generar link EasyLex para que cambios futuros de CSV no alteren lo firmado.
- Confirmar con EasyLex si el plan/API contratado permite webhook o postback de firma. Si no existe, disenar fallback por polling, descarga/consulta operativa o conciliacion manual desde backoffice.
- Usar idempotency keys en clics de ManyChat y webhooks de EasyLex.
- Guardar payload crudo y payload resumido cuando sea posible.
- No exponer datos sensibles completos en vistas operativas.
- Permitir reintentos manuales solo con auditoria.

## Estrategia De Ofertas

Usar versionado de ofertas, no sobrescritura ciega ni nueva oferta por cada importacion identica.

- Si el CSV trae el mismo RFC sin cambios relevantes, no crear oferta nueva.
- Si cambia monto, estatus, empleador, CLABE u otro dato operativo, crear nueva version de oferta y marcar la anterior como reemplazada.
- Mantener solo una oferta `is_current = true` por empleado.
- Si una oferta anterior ya genero contrato, conservar su snapshot y su historial.
- Si una oferta ya esta firmada, no modificar lo firmado aunque una importacion posterior cambie datos.
