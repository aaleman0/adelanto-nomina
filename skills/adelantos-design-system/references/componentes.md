# Componentes Y Compartimentalizacion

## Estructura

- `src/components/ui`: primitivas compartidas como `Button`, `Card`, `Metric`, `StatusBadge`, `DataTable`.
- `src/components/layout`: estructura general como `AppShell`, `PageHeader`.
- `src/components/imports`: componentes especificos de importaciones.
- `src/lib`: logica server-side, parsing, Supabase y reglas de negocio.

## Reglas

- Mantener componentes de UI sin conocimiento de Supabase.
- Mantener fetch/mutaciones en route handlers o server-side, no dentro de componentes visuales puros.
- Usar client components solo para interaccion necesaria: botones, formularios, estados de carga.
- Reutilizar `Button`, `Card`, `StatusBadge` y `Metric` en vez de repetir clases.
- Las tablas deben recibir datos ya preparados; no deben transformar reglas de negocio.

## Componentes Base

- `Button`: variantes `primary`, `secondary`, `ghost`, `danger`.
- `Card`: contenedor con borde y padding consistente.
- `Metric`: etiqueta + valor.
- `StatusBadge`: estado textual con color consistente.
- `PageHeader`: titulo, subtitulo opcional y acciones.
