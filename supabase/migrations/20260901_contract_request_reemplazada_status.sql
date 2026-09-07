-- Estado terminal nuevo para contract_requests: 'reemplazada'.
--
-- Cuando un CICLO nuevo (lote de importación) reemplaza la oferta de un empleado
-- recurrente, su solicitud de contrato ANTERIOR que seguía activa
-- (recibida/generando/link_generado) se cierra pasándola a 'reemplazada'. Esto
-- libera el índice `contract_requests_one_active_per_employee_idx` para que el
-- ciclo nuevo pueda generar su propio contrato, y limpia la elegibilidad.
--
-- Las solicitudes 'firmado' NO se tocan (se conserva la evidencia de la firma).
--
-- Nota: ADD VALUE solo agrega el valor al enum; no lo usa en esta transacción,
-- así que es seguro aplicarlo tal cual. Aplicar ANTES de desplegar el código que
-- escribe este estado (src/lib/imports/apply.ts → supersedePreviousContract).

ALTER TYPE public.contract_request_status ADD VALUE IF NOT EXISTS 'reemplazada';
