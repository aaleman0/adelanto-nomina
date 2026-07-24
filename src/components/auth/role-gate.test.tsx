import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { RoleGate } from "./role-gate";
import { RoleProvider } from "./role-context";
import type { UserRole } from "@/lib/auth/roles-shared";

/**
 * Primer test de componente del repo. Cubre el guard de RBAC en la UI, que es
 * solo experiencia (la barrera real es `requireRole` en el servidor), pero cuyo
 * comportamiento —ocultar o deshabilitar según el rol— conviene fijar.
 */
function renderWithRole(role: UserRole, ui: ReactNode) {
  return render(<RoleProvider role={role}>{ui}</RoleProvider>);
}

describe("RoleGate", () => {
  it("muestra el contenido cuando el rol alcanza el mínimo", () => {
    renderWithRole(
      "admin",
      <RoleGate minimum="operaciones" mode="disable">
        <button>Enviar</button>
      </RoleGate>,
    );
    expect(screen.getByRole("button", { name: "Enviar" })).toBeEnabled();
  });

  it("es acumulativo: el rol operaciones alcanza el mínimo operaciones", () => {
    renderWithRole(
      "operaciones",
      <RoleGate minimum="operaciones" mode="disable">
        <button>Enviar</button>
      </RoleGate>,
    );
    expect(screen.getByRole("button", { name: "Enviar" })).toBeEnabled();
  });

  it("mode=disable: deshabilita el control y explica qué rol hace falta", () => {
    renderWithRole(
      "solo_lectura",
      <RoleGate minimum="operaciones" mode="disable">
        <button>Enviar</button>
      </RoleGate>,
    );
    const btn = screen.getByRole("button", { name: "Enviar" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", "Requiere rol operaciones.");
  });

  it("mode=hide: no renderiza el contenido si falta permiso", () => {
    renderWithRole(
      "solo_lectura",
      <RoleGate minimum="admin" mode="hide">
        <button>Ajustes</button>
      </RoleGate>,
    );
    expect(screen.queryByRole("button", { name: "Ajustes" })).toBeNull();
  });

  it("sin provider asume el mínimo (solo_lectura) y oculta lo privilegiado", () => {
    render(
      <RoleGate minimum="operaciones" mode="hide">
        <button>Enviar</button>
      </RoleGate>,
    );
    expect(screen.queryByRole("button", { name: "Enviar" })).toBeNull();
  });
});
