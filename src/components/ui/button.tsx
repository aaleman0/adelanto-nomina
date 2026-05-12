import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white hover:bg-primary-strong",
  secondary: "bg-secondary text-white hover:bg-secondary-strong",
  ghost: "border border-border bg-surface text-white hover:bg-surface-muted",
  danger: "bg-danger text-white hover:bg-danger-bg",
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
        "inline-flex h-10 items-center justify-center rounded-base px-4 text-sm font-semibold transition-colors",
        "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted",
        variantClasses[variant],
        className,
      ].join(" ")}
      {...props}
    />
  );
}
