import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm shadow-indigo-300 hover:from-indigo-700 hover:to-violet-700 hover:shadow-md hover:shadow-indigo-200 active:scale-[0.98]",
  secondary:
    "bg-surface border border-primary-border text-primary hover:bg-primary-light hover:border-primary active:scale-[0.98]",
  ghost:
    "border border-border bg-surface text-text-primary hover:bg-surface-muted hover:border-border-strong active:scale-[0.98]",
  danger:
    "bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-sm shadow-red-200 hover:from-red-600 hover:to-rose-700 active:scale-[0.98]",
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
        "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition-all duration-150",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
        variantClasses[variant],
        className,
      ].join(" ")}
      {...props}
    />
  );
}
