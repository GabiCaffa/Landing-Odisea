import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Loader2, Music2, Pause } from "lucide-react";

/**
 * Música del mapa 3D desde SoundCloud (un set o una playlist pública). La
 * licencia la maneja SoundCloud: es su reproductor oficial (widget), escondido,
 * manejado por su API de JS.
 *
 * - **Arranca sola al entrar al mapa** (`auto`, pedido del autor). Los navegadores
 *   no dejan sonar audio antes de que la persona toque algo: si se llegó tocando
 *   "Ver el mapa 3D" suena directo; si se entró por un link, queda lista y
 *   **arranca con el primer toque o tecla en cualquier parte del mapa**, con el
 *   botón titilando mientras tanto. Sin `auto`, no se baja nada hasta tocar el botón.
 * - **El volumen sigue al mapa** (`volumen()`, 0 a 1): caminando, más fuerte cerca
 *   del escenario. Se ajusta cada 400 ms mientras suena.
 * - **Si el navegador no deja arrancar el audio solo** (iOS lo frena porque el
 *   play llega por mensaje a otro dominio), a los 3 s se muestra el reproductor
 *   de SoundCloud para tocar su play.
 * - Mientras suena se ve qué tema es y un link a SoundCloud (lo pide su API).
 */

interface SonidoSC {
  title?: string;
  permalink_url?: string;
  user?: { username?: string };
}

interface WidgetSC {
  play(): void;
  pause(): void;
  setVolume(v: number): void;
  bind(evento: string, cb: (datos?: { currentPosition?: number }) => void): void;
  getCurrentSound(cb: (s: SonidoSC | null) => void): void;
}

declare global {
  interface Window {
    SC?: {
      Widget: ((el: HTMLIFrameElement) => WidgetSC) & {
        Events: { READY: string; PLAY: string; PLAY_PROGRESS: string; PAUSE: string; FINISH: string; ERROR: string };
      };
    };
  }
}

let api: Promise<void> | null = null;
const cargarApi = () =>
  (api ??= new Promise<void>((resolver, fallar) => {
    if (window.SC?.Widget) return resolver();
    const s = document.createElement("script");
    s.src = "https://w.soundcloud.com/player/api.js";
    s.async = true;
    s.onload = () => resolver();
    s.onerror = () => {
      api = null;
      fallar(new Error("soundcloud"));
    };
    document.head.appendChild(s);
  }));

/** `esperando`: cargada pero el navegador no dejó arrancar; suena con el primer toque. */
type Estado = "apagada" | "cargando" | "esperando" | "sonando" | "pausada" | "bloqueada" | "error";

const MusicaSoundcloud = ({
  url,
  volumen,
  auto = false,
}: {
  url: string;
  volumen: () => number;
  /** Arrancar sola al montar (o con el primer toque, si el navegador no deja). */
  auto?: boolean;
}) => {
  const [estado, setEstado] = useState<Estado>(auto ? "cargando" : "apagada");
  const [montar, setMontar] = useState(auto);
  const [tema, setTema] = useState<{ titulo: string; autor?: string; link: string } | null>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const widget = useRef<WidgetSC | null>(null);
  const volumenRef = useRef(volumen);
  volumenRef.current = volumen;
  // Cuándo avanzó el tema por última vez. **"Sonando" es que avance, no el evento
  // PLAY**: con el audio bloqueado por el navegador, SoundCloud igual avisa PLAY y el
  // botón quedaba naranja sin que sonara nada.
  const ultimoAvance = useRef(0);
  const control = useRef(0);

  /**
   * Pide que suene y a los 3,5 s se fija si el tema avanzó. Si no: arrancando sola
   * queda esperando un toque; si ya la tocaron, se muestra el reproductor.
   * `pause()` antes de `play()`: si SoundCloud cree que ya está sonando, `play()` solo
   * no hace nada.
   */
  const intentar = (siFalla: Estado) => {
    const w = widget.current;
    if (!w) return;
    const pedido = Date.now();
    w.pause();
    w.play();
    window.clearTimeout(control.current);
    control.current = window.setTimeout(() => {
      if (ultimoAvance.current < pedido) setEstado(siFalla);
    }, 3500);
  };

  const tocar = () => {
    if (estado === "sonando") return widget.current?.pause();
    if (widget.current) {
      setEstado("cargando");
      return intentar("bloqueada");
    }
    setEstado("cargando");
    setMontar(true);
  };

  // Con el reproductor montado: la API, los eventos y el primer play.
  useEffect(() => {
    if (!montar) return;
    let vivo = true;
    cargarApi()
      .then(() => {
        if (!vivo || !iframe.current || !window.SC) return;
        const w = window.SC.Widget(iframe.current);
        const E = window.SC.Widget.Events;
        widget.current = w;
        w.bind(E.READY, () => {
          if (!vivo) return;
          w.setVolume(Math.round(volumenRef.current() * 100));
          w.getCurrentSound((s) => {
            if (vivo && s) setTema({ titulo: s.title ?? "SoundCloud", autor: s.user?.username, link: s.permalink_url ?? url });
          });
          intentar(auto ? "esperando" : "bloqueada");
        });
        // Suena de verdad recién cuando el tema avanza.
        let ultimaPos = -1;
        w.bind(E.PLAY_PROGRESS, (d) => {
          const p = d?.currentPosition ?? 0;
          if (!vivo || p <= ultimaPos) return;
          ultimaPos = p;
          ultimoAvance.current = Date.now();
          setEstado((e) => (e === "sonando" ? e : "sonando"));
        });
        // Una pausa sólo cuenta si estaba sonando (bloqueado, SoundCloud también la avisa).
        w.bind(E.PAUSE, () => vivo && setEstado((e) => (e === "sonando" ? "pausada" : e)));
        w.bind(E.FINISH, () => vivo && setEstado("pausada"));
        w.bind(E.ERROR, () => vivo && setEstado("error"));
      })
      .catch(() => vivo && setEstado("error"));
    return () => {
      vivo = false;
      window.clearTimeout(control.current);
    };
  }, [montar, url, auto]);

  // Arrancando sola y frenada por el navegador: el primer toque o tecla en
  // cualquier parte la pone a sonar (ése sí cuenta como gesto de la persona).
  useEffect(() => {
    if (estado !== "esperando") return;
    // Con el toque de la persona el navegador ya deja: se vuelve a intentar.
    const arrancar = () => intentar("bloqueada");
    window.addEventListener("pointerdown", arrancar, { once: true, capture: true });
    window.addEventListener("keydown", arrancar, { once: true, capture: true });
    return () => {
      window.removeEventListener("pointerdown", arrancar, { capture: true });
      window.removeEventListener("keydown", arrancar, { capture: true });
    };
  }, [estado]);

  // El volumen acompaña al mapa mientras suena.
  useEffect(() => {
    if (estado !== "sonando") return;
    const id = window.setInterval(() => widget.current?.setVolume(Math.round(volumenRef.current() * 100)), 400);
    return () => window.clearInterval(id);
  }, [estado]);

  // Al cerrar el mapa, que no siga sonando. No alcanza con `pause()`: es un mensaje
  // al iframe que puede no llegar antes de que se lo saque, y Safari (iPhone) deja
  // sonando el audio de un iframe quitado. Se lo vacía (`about:blank`) ANTES de
  // sacarlo: el efecto de layout se limpia con el nodo todavía en la página.
  useLayoutEffect(() => {
    const el = iframe;
    return () => {
      widget.current?.pause();
      widget.current = null;
      if (el.current) el.current.src = "about:blank";
    };
  }, []);
  // Si la persona se va del sitio o cierra la pestaña con el mapa abierto.
  useEffect(() => {
    const cortar = () => widget.current?.pause();
    window.addEventListener("pagehide", cortar);
    return () => window.removeEventListener("pagehide", cortar);
  }, []);

  const visible = estado === "bloqueada" || estado === "error";
  const src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&visual=false`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={tocar}
        aria-pressed={estado === "sonando"}
        aria-label={estado === "sonando" ? "Pausar la música" : "Poner música"}
        className={`flex h-11 w-11 items-center justify-center rounded-full backdrop-blur transition-colors ${
          estado === "sonando" ? "bg-[#F25C26] text-white" : "bg-white/10 hover:bg-white/20"
        } ${estado === "esperando" ? "animate-pulse ring-2 ring-[#F25C26]" : ""}`}
      >
        {estado === "cargando" ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : estado === "sonando" ? (
          <Pause className="h-5 w-5" />
        ) : (
          <Music2 className="h-5 w-5" />
        )}
      </button>

      {estado === "esperando" && (
        <p className="pointer-events-none absolute right-0 top-12 whitespace-nowrap rounded-full bg-black/65 px-3 py-1.5 text-[11px] text-white/90 backdrop-blur">
          Tocá el mapa para escuchar la música
        </p>
      )}

      {/* Qué suena, con el link a SoundCloud. */}
      {estado === "sonando" && tema && (
        <a
          href={tema.link}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute right-0 top-12 flex w-60 max-w-[70vw] items-center gap-2 rounded-full bg-black/65 px-3 py-1.5 text-[11px] text-white/90 backdrop-blur"
        >
          <Music2 className="h-3.5 w-3.5 flex-shrink-0 text-[#F25C26]" aria-hidden />
          <span className="truncate">
            {tema.titulo}
            {tema.autor ? ` · ${tema.autor}` : ""}
          </span>
          <span className="flex-shrink-0 font-bold text-[#ff7700]">SoundCloud</span>
        </a>
      )}

      {/* El reproductor de SoundCloud: escondido, salvo que haya que tocar su play. */}
      {montar && (
        <div
          className={
            visible
              ? "absolute right-0 top-12 w-72 max-w-[80vw] overflow-hidden rounded-xl bg-black/80 p-2 shadow-xl"
              : "pointer-events-none fixed -left-[9999px] top-0 h-px w-px overflow-hidden opacity-0"
          }
        >
          {visible && (
            <p className="mb-1.5 px-1 text-[11px] text-white/80">
              {estado === "error" ? "No se pudo cargar la música." : "Tocá play para escuchar la música."}
            </p>
          )}
          <iframe
            ref={iframe}
            title="Música del mapa (SoundCloud)"
            src={src}
            allow="autoplay"
            className="h-[120px] w-full border-0"
          />
        </div>
      )}
    </div>
  );
};

export default MusicaSoundcloud;
