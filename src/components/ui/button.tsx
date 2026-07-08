import type { ButtonHTMLAttributes } from "react";

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
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
}) {
  return (
    <button
      className={[
        "inline-flex h-9 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variantClasses[variant],
        className,
      ].join(" ")}
      {...props}
    />
  );
}
