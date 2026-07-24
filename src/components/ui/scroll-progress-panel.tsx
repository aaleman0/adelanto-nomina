"use client";

import type { HTMLAttributes, UIEvent } from "react";
import { useState } from "react";

export function ScrollProgressPanel({ className = "", children, ...props }: HTMLAttributes<HTMLDivElement>) {
  const [progress, setProgress] = useState(0);
  function updateProgress(event: UIEvent<HTMLDivElement>) {
    const panel = event.currentTarget;
    const distance = panel.scrollHeight - panel.clientHeight;
    setProgress(distance > 0 ? panel.scrollTop / distance : 0);
  }
  return (
    <div className={`surface-panel relative flex min-h-0 flex-col overflow-hidden rounded-xl ${className}`} {...props}>
      <div className="absolute inset-x-0 top-0 z-10 h-1 bg-surface-alt"><div className="h-full bg-[var(--color-3)]" style={{ width: `${progress * 100}%` }} /></div>
      <div className="panel-scroll min-h-0 flex-1" onScroll={updateProgress}>{children}</div>
    </div>
  );
}
