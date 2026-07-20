import type { ButtonHTMLAttributes } from "react";
import { LetterWave } from "./letter-wave";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover",
  secondary: "border border-primary-border bg-surface text-primary hover:bg-primary-light",
  ghost: "border border-border bg-surface text-text-primary hover:bg-surface-muted",
  danger: "bg-danger text-white hover:bg-red-700",
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
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variantClasses[variant],
        className,
      ].join(" ")}
      {...props}
    >
      {wave && typeof children === "string" ? <LetterWave>{children}</LetterWave> : children}
    </button>
  );
}
