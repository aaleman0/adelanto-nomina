import type { HTMLAttributes } from "react";

/**
 * "Card" ya NO es una caja. En el sistema editorial la estructura la dan el
 * espacio y las líneas finas, no un recuadro. Se conserva el componente (lo usa
 * todo el app) pero renderiza una sección transparente; el `className` que
 * recibe (padding, etc.) sigue aplicando.
 */
export function Card({ className = "", ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={className} {...props} />;
}

export function CardHeader({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={["border-b border-border pb-4 mb-4", className].join(" ")}
      {...props}
    />
  );
}

export function CardBody({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={className} {...props} />;
}
