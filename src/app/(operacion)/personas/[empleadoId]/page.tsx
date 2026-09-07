import { notFound } from "next/navigation";
import { Screen } from "@/ui/screen";
import { BlockTitle, Card, Datum, Stack, Sunken } from "@/ui/surface";
import { Status } from "@/ui/status";
import { ProblemNote, SuccessNote } from "@/ui/states";
import { getContractDetailData } from "@/lib/backoffice/contract-detail";
import { validateEligibility } from "@/lib/whatsapp/eligibility";
import { getCurrentActor, hasRole } from "@/lib/auth/roles";
import {
  AccionesExpediente,
  type AccionPrincipal,
} from "../_ui/acciones-expediente";
import { HistorialWhatsApp } from "../_ui/historial-whatsapp";
import { LineaDeTiempo } from "../_ui/linea-de-tiempo";
import {
  avisoDeAccion,
  enlaceSigueVigente,
  fecha,
  motivoNoElegible,
  nombreDe,
  pesos,
} from "../_ui/vocabulario";

// El expediente se consulta justo después de actuar sobre él: siempre en vivo.
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ empleadoId: string }>;
  searchParams: Promise<{ action_status?: string }>;
};

export default async function ExpedientePage({ params, searchParams }: Props) {
  const { empleadoId } = await params;
  const { action_status } = await searchParams;

  const { control, timeline } = await getContractDetailData(empleadoId);
  if (!control) {
    notFound();
  }

  const actor = await getCurrentActor().catch(() => null);
  const puedeOperar = hasRole(actor?.role ?? "solo_lectura", "operaciones");

  // "Firmado" se cree por la evidencia de la firma, no solo por el estado
  // calculado: un ciclo nuevo puede reemplazar la oferta y la firma persiste.
  const firmado =
    control.operational_status === "firmado" ||
    Boolean(control.contract_signed_at || control.attempt_signed_at);
  const haySolicitud = Boolean(control.contract_request_id);
  const enlaceVigente = enlaceSigueVigente(control.link_expires_at);

  // El motivo concreto de la inelegibilidad ya existe en la capa de negocio;
  // sin él, "No elegible" es un callejón sin salida para el operador.
  let motivo: string | null = null;
  if (control.operational_status === "no_elegible") {
    try {
      const elegibilidad = await validateEligibility(empleadoId);
      motivo = elegibilidad.eligible ? null : motivoNoElegible(elegibilidad.reason);
    } catch {
      motivo = "No se pudo averiguar el motivo. Vuelve a abrir el expediente en un momento.";
    }
  }

  const aviso = avisoDeAccion(action_status);
  const nombre = nombreDe(control);

  // El estado del expediente viaja crudo hasta <Status>: traducirlo aquí era
  // tener un segundo diccionario que se desincroniza del del sistema.
  return (
    <Screen
      title={nombre}
      lead={control.empleador ?? "Sin empleador registrado"}
      back={{ href: "/personas", label: "Volver a Personas" }}
      action={<Status value={control.operational_status} />}
    >
      <Stack gap="gap-6">
        {aviso ? (
          aviso.tono === "ok" ? (
            <SuccessNote>{aviso.texto}</SuccessNote>
          ) : aviso.tono === "falla" ? (
            <ProblemNote>{aviso.texto}</ProblemNote>
          ) : (
            // Ni éxito ni fallo: pasó algo que hay que saber (se reutilizó un
            // enlace, ya estaba firmado…). Tono de atención del sistema.
            <div
              role="status"
              className="rounded-md border border-attention-line bg-attention-soft px-5 py-4 text-[17px] font-medium text-attention"
            >
              {aviso.texto}
            </div>
          )
        ) : null}

        {motivo ? (
          <Card>
            <BlockTitle
              title="Por qué está fuera del adelanto"
              hint="Mientras siga así, no se le puede mandar oferta ni generar contrato."
            />
            <Sunken>
              <p className="text-[19px] leading-relaxed text-ink">{motivo}</p>
            </Sunken>
          </Card>
        ) : null}

        <Card>
          <BlockTitle title="Datos del adelanto" />
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            <Datum label="Monto autorizado" value={pesos(control.monto_prestamo_autorizado)} tone="strong" />
            <Datum label="RFC" value={control.rfc ?? "Sin RFC"} mono />
            <Datum label="Teléfono" value={control.telefono_normalizado ?? "Sin teléfono"} mono />
            <Datum label="Empleador" value={control.empleador ?? "Sin empleador"} />
            <Datum label="Correo" value={control.email ?? "Sin correo"} />
            <Datum
              label="Último movimiento"
              value={fecha(control.last_movement_at, "Sin movimientos")}
            />
          </div>

          <Sunken className="mt-6">
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              <Datum
                label="Contrato pedido el"
                value={fecha(control.contract_requested_at, "Todavía no se pide")}
              />
              <Datum
                label="Enlace de firma"
                value={
                  control.link_expires_at
                    ? enlaceVigente
                      ? `Sirve hasta el ${fecha(control.link_expires_at)}`
                      : `Se venció el ${fecha(control.link_expires_at)}`
                    : "Todavía no hay enlace"
                }
              />
              <Datum
                label="Firmado el"
                value={fecha(control.contract_signed_at ?? control.attempt_signed_at, "Todavía no firma")}
              />
            </div>
            {/* La última falla solo importa mientras el expediente siga abierto.
                Una vez firmado, el error que hubo en el camino ya se resolvió, y
                dejarlo en rojo hace creer que algo sigue mal en un contrato que
                está terminado. */}
            {!firmado && (control.contract_error || control.attempt_error) ? (
              <p className="mt-5 text-[17px] leading-relaxed text-failed">
                Última falla registrada: {control.contract_error ?? control.attempt_error}
              </p>
            ) : null}
          </Sunken>
        </Card>

        <AccionesExpediente
          employeeId={control.employee_id}
          contractRequestId={control.contract_request_id}
          rfc={control.rfc}
          telefono={control.telefono_normalizado}
          firmado={firmado}
          haySolicitud={haySolicitud}
          puedeOperar={puedeOperar}
          principal={accionQueToca(control.operational_status, firmado, haySolicitud)}
          signingUrl={control.signing_url}
          enlaceVigente={enlaceVigente}
          linkExpiraEn={control.link_expires_at}
        />

        <HistorialWhatsApp employeeId={control.employee_id} />

        {/* Se recorta la fila a los cinco campos que la interfaz puede mostrar.
            `metadata` se queda aquí: lleva datos del operador que actuó y esta
            pantalla nunca mide a las personas, solo el estado del trabajo. */}
        <LineaDeTiempo
          eventos={timeline.map((evento) => ({
            occurred_at: evento.occurred_at,
            source: evento.source,
            event_type: evento.event_type,
            status: evento.status,
            summary: evento.summary,
          }))}
        />
      </Stack>
    </Screen>
  );
}

/** Qué acción toca ahora, para darle a esa el tamaño y el peso de la principal. */
function accionQueToca(
  estado: string,
  firmado: boolean,
  haySolicitud: boolean,
): AccionPrincipal {
  if (firmado) return "entregar";
  if (estado === "error") return "reintentar";
  if (estado === "link_expirado") return "regenerar";
  if (estado === "no_elegible") return "ninguna";
  if (!haySolicitud) return "solicitar";
  return "ninguna";
}
