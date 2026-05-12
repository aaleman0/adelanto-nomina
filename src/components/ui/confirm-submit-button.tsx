"use client";

import { useFormStatus } from "react-dom";
import { Button } from "./button";

export function ConfirmSubmitButton({
  children,
  confirmMessage,
  disabled,
  variant,
}: {
  children: React.ReactNode;
  confirmMessage: string;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      disabled={disabled || pending}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
      type="submit"
      variant={variant}
    >
      {pending ? "Procesando..." : children}
    </Button>
  );
}
