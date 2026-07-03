import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// Timestamp del último auto-reload por chunk vencido. Si el error se repite
// enseguida (< 15 s) es que la recarga no lo resolvió → es un error real y NO
// volvemos a recargar (evita un loop). Si pasó más tiempo, permitimos recargar
// de nuevo (p. ej. otro deploy semanas después).
const RELOAD_FLAG = "odisea:chunk-reload-at";
const RELOAD_COOLDOWN_MS = 15_000;

/**
 * Detecta el error típico de "chunk lazy que ya no existe" tras un deploy nuevo:
 * el navegador tiene el index.html viejo y pide un .js con hash que Vercel ya
 * reemplazó. El mensaje varía entre navegadores, así que chequeamos varios.
 */
function isChunkLoadError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    msg.includes("dynamically imported module") ||
    msg.includes("importing a module script failed") ||
    msg.includes("failed to fetch") ||
    msg.includes("chunkloaderror") ||
    msg.includes("error loading")
  );
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

    // Si es un chunk vencido por un deploy nuevo, recargamos automáticamente
    // para bajar la versión actual (evita la pantalla blanca "a veces"). El
    // cooldown corta un posible loop si el error resultara permanente.
    if (isChunkLoadError(error)) {
      const last = Number(sessionStorage.getItem(RELOAD_FLAG) ?? 0);
      if (Date.now() - last > RELOAD_COOLDOWN_MS) {
        sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
        window.location.reload();
      }
    }
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
