"use client";

import { useState } from "react";

export function CopyLinkButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button className="inline-flex h-10 items-center rounded-base border border-border bg-surface px-4 text-sm font-semibold text-text-primary transition hover:bg-surface-muted" onClick={copy} type="button">
      {copied ? "Copiado" : "Copiar link"}
    </button>
  );
}
