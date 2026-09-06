"use client";

import React from "react";

type Props = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  section?: string;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

/**
 * React Error Boundary genérico.
 * Captura errores en el árbol de componentes hijo y muestra una UI de fallback.
 * Uso: <ErrorBoundary section="WhatsApp Dashboard"><ComponenteComplejo /></ErrorBoundary>
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // En producción aquí se enviaría a un servicio de monitoreo (Sentry, etc.)
    console.error(`[ErrorBoundary:${this.props.section ?? "App"}]`, error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <ErrorFallback
          error={this.state.error}
          section={this.props.section}
          onReset={this.handleReset}
        />
      );
    }
    return this.props.children;
  }
}

/** UI de fallback por defecto */
export function ErrorFallback({
  error,
  section,
  onReset,
}: {
  error: Error | null;
  section?: string;
  onReset?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--danger-border)] bg-surface px-6 py-10 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-danger-bg">
        <svg
          className="h-6 w-6 text-danger"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
      </div>
      <h2 className="mb-1 text-base font-bold text-danger">
        {section ? `Error en ${section}` : "Algo salió mal"}
      </h2>
      <p className="mb-4 max-w-sm text-sm text-text-muted">
        {error?.message ?? "Ocurrió un error inesperado. Por favor intenta de nuevo."}
      </p>
      <div className="flex gap-3">
        {onReset && (
          <button
            onClick={onReset}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover"
          >
            Reintentar
          </button>
        )}
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-text-primary transition hover:bg-surface-muted"
        >
          Recargar página
        </button>
      </div>
    </div>
  );
}
