import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white hover:bg-primary-strong",
  secondary: "bg-secondary text-white hover:bg-secondary-strong",
  ghost: "border border-border bg-surface text-text-primary hover:bg-surface-muted",
  danger: "bg-red-700 text-white hover:bg-red-800",
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
