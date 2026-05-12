"use client";

import { useState } from "react";
import { Button } from "./button";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  confirmMessage?: string;
  loadingText?: string;
};

export function SafeActionButton({
  children,
  confirmMessage,
  loadingText = "Procesando...",
  onClick,
  ...props
}: Props) {
  const [loading, setLoading] = useState(false);

  return (
    <Button
      {...props}
      disabled={props.disabled || loading}
      onClick={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault();
          return;
        }
        setLoading(true);
        onClick?.(event);
      }}
    >
      {loading ? loadingText : children}
    </Button>
  );
}
