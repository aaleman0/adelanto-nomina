import type { ButtonHTMLAttributes } from "react";
import { LetterWave } from "./letter-wave";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

// Botones planos y de esquina recta (editorial). El primario lleva el único
// acento (verde); secundario es una línea fina; ghost es texto. Sin sombras ni
// desplazamientos.
const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover",
  secondary: "border border-border-strong text-text-primary hover:bg-surface-muted",
  ghost: "text-text-primary hover:bg-surface-muted",
  danger: "bg-danger text-white hover:opacity-90",
};

export function Button({
  className = "",
  variant = "primary",
  wave = false,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  wave?: boolean;
}) {
  return (
    <button
      className={[
        "inline-flex h-10 items-center justify-center gap-2 rounded-none px-4 text-sm font-semibold transition-colors duration-150",
        "disabled:cursor-not-allowed disabled:opacity-45",
        variantClasses[variant],
        className,
      ].join(" ")}
      {...props}
    >
      {wave && typeof children === "string" ? <LetterWave>{children}</LetterWave> : children}
    </button>
  );
}
