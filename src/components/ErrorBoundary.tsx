import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Captura errores de render (incl. chunks lazy que fallan al cargar tras un
 * deploy) para evitar la pantalla en blanco: muestra un aviso con estética
 * ODÍSEA y un botón para recargar en lugar de dejar la app muerta.
 */
class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // Log para diagnóstico en la consola del navegador.
    console.error("[ErrorBoundary]", error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
        <p className="font-sport text-xs tracking-[0.4em] uppercase text-celeste-deep font-bold mb-3">
          ODÍSEA
        </p>
        <h1 className="title-sport text-3xl md:text-4xl font-black text-tinta mb-3">
          Algo salió mal
        </h1>
        <p className="text-sm text-muted-foreground max-w-sm mb-8">
          Tuvimos un problema al cargar esta pantalla. Recargá la página para
          seguir.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="text-sm font-semibold tracking-wide bg-celeste text-white rounded-full px-6 py-2.5 hover:bg-celeste-deep active:scale-[0.98] transition-all"
        >
          Recargar
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;
