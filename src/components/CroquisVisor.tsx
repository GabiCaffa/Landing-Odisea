import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Cigarette, CupSoda, Eye, Footprints, MapPin, Moon, Music, PersonStanding, Share2, Sun, Sunset, Ticket, X } from "lucide-react";
import { toast } from "sonner";
import { SITIO, urlDeMapa } from "@/lib/rutas";
import { formatEventDate, useAuth } from "@/contexts/AuthContext";
import { foldText } from "@/lib/utils";
import { fmtSimple } from "@/lib/moneda";
import type { EventTicket } from "@/lib/ticketTypes";
import type { Hora, Predio, ZonaPredio } from "@/croquis/tipos";
import type { ControlCroquis } from "@/croquis/motor";
import { cargarPredio } from "@/croquis/registro";
import MusicaSoundcloud from "@/components/MusicaSoundcloud";

interface Props {
  slug: string;
  onClose: () => void;
  /**
   * Botón de compra arriba. Lo pasa la página propia del mapa: quien llega desde
   * un anuncio tiene que poder comprar sin buscar dónde.
   */
  compra?: { href: string; texto: string };
}

/** Celular parado (angosto) o acostado (bajito). */
const MEDIA_COMPACTO = "(max-width: 639px), (max-height: 500px)";

const HORAS: { id: Hora; nombre: string; icono: typeof Sun }[] = [
  { id: "dia", nombre: "Día", icono: Sun },
  { id: "atardecer", nombre: "Atardecer", icono: Sunset },
  { id: "noche", nombre: "Noche", icono: Moon },
];

/**
 * El croquis 3D del predio, a pantalla completa sobre la página del evento.
 *
 * Este componente se carga con `lazy` y además baja el motor (Three.js) recién
 * cuando se monta: el visor aparece al instante con "Armando el predio…" y la
 * escena llega después. Nada de esto viaja en la carga de la página.
 *
 * Va por `createPortal` como `VisorFlyer` (§6.5): un ancestro con `transform`
 * rompería el `position: fixed`. Siempre oscuro, con colores propios: es un
 * visor, no una pantalla del tema.
 */
/**
 * Palanca táctil para caminar en el celular. Se maneja con el pulgar izquierdo;
 * el derecho queda para girar la cámara arrastrando sobre el mapa.
 */
const Joystick = ({ onMover, chico = false }: { onMover: (x: number, y: number) => void; chico?: boolean }) => {
  const base = useRef<HTMLDivElement>(null);
  const [perilla, setPerilla] = useState({ x: 0, y: 0 });
  const apretado = useRef(false);
  const RADIO = chico ? 36 : 46;

  const mover = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > RADIO) {
      dx = (dx * RADIO) / d;
      dy = (dy * RADIO) / d;
    }
    setPerilla({ x: dx, y: dy });
    onMover(dx / RADIO, -dy / RADIO);
  };
  const soltar = () => {
    apretado.current = false;
    setPerilla({ x: 0, y: 0 });
    onMover(0, 0);
  };

  return (
    <div
      ref={base}
      className={`relative touch-none select-none rounded-full border border-white/25 bg-white/10 backdrop-blur ${chico ? "h-24 w-24" : "h-32 w-32"}`}
      onPointerDown={(e) => {
        apretado.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        mover(e);
      }}
      onPointerMove={(e) => apretado.current && mover(e)}
      onPointerUp={soltar}
      onPointerCancel={soltar}
      aria-label="Palanca para caminar"
      role="application"
    >
      <div
        className={`pointer-events-none absolute left-1/2 top-1/2 rounded-full bg-white/85 shadow-lg ${chico ? "h-11 w-11" : "h-14 w-14"}`}
        style={{ transform: `translate(calc(-50% + ${perilla.x}px), calc(-50% + ${perilla.y}px))` }}
      />
    </div>
  );
};

const CompraEntradas = lazy(() => import("@/components/CompraEntradas"));

/** Las entradas a la venta del evento que son de esta zona (por palabras en el nombre). */
function entradasDeZona(zona: ZonaPredio | undefined, tickets: EventTicket[]): EventTicket[] {
  const cfg = zona?.entradas;
  if (!cfg) return [];
  const incluye = cfg.incluye.map(foldText);
  const excluye = (cfg.excluye ?? []).map(foldText);
  return tickets
    .filter((t) => t.active)
    .filter((t) => {
      const n = foldText(t.name);
      return incluye.some((w) => n.includes(w)) && !excluye.some((w) => n.includes(w));
    })
    .sort((a, b) => a.price - b.price);
}

const CroquisVisor = ({ slug, onClose, compra }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const control = useRef<ControlCroquis | null>(null);
  const cerrarRef = useRef(onClose);
  cerrarRef.current = onClose;

  const [predio, setPredio] = useState<Predio | null>(null);
  const [estado, setEstado] = useState<"cargando" | "listo" | "error">("cargando");
  const [vista, setVista] = useState("");
  const [hora, setHora] = useState<Hora>("noche");
  const [caminando, setCaminando] = useState(false);
  const [zona, setZona] = useState<{ id: string; nombre: string } | null>(null);
  // Bailando en el lugar (lo apaga el motor solo al caminar).
  const [bailando, setBailando] = useState(false);
  // Primera persona (en los ojos) o tercera (atrás, se ve el personaje entero).
  const [primera, setPrimera] = useState(false);
  // La compra abierta encima del mapa, con la entrada de la zona ya elegida.
  const [comprando, setComprando] = useState<{ preseleccion?: string } | null>(null);
  const comprandoRef = useRef(false);
  comprandoRef.current = comprando !== null;
  const { events } = useAuth();
  const evento = events.find((e) => e.slug === slug);
  const vende = evento?.status === "activo";
  const [tactil] = useState(() => window.matchMedia("(pointer: coarse)").matches);
  const [vertical, setVertical] = useState(() => window.matchMedia("(orientation: portrait)").matches);
  // Pantalla chica (celular parado o acostado): todo el HUD más chico, para que
  // no tape el mapa (pedido del autor).
  const [compacto, setCompacto] = useState(() => window.matchMedia(MEDIA_COMPACTO).matches);
  // "Girá el celular": un cartelito arriba que se va solo o con la cruz.
  const [avisoGiro, setAvisoGiro] = useState(true);
  const caminandoRef = useRef(false);
  caminandoRef.current = caminando;
  // El mouse tomado para mirar (Pointer Lock). Esc lo suelta: ese mismo Escape
  // no tiene que sacar de la caminata.
  const [mouseTomado, setMouseTomado] = useState(false);
  const soltadoEn = useRef(0);

  useEffect(() => {
    const mq = window.matchMedia("(orientation: portrait)");
    const mc = window.matchMedia(MEDIA_COMPACTO);
    const cambio = () => {
      setVertical(mq.matches);
      setCompacto(mc.matches);
    };
    mq.addEventListener("change", cambio);
    mc.addEventListener("change", cambio);
    return () => {
      mq.removeEventListener("change", cambio);
      mc.removeEventListener("change", cambio);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || comprandoRef.current) return;
      if (document.pointerLockElement || Date.now() - soltadoEn.current < 400) return;
      if (caminandoRef.current) {
        caminandoRef.current = false;
        setCaminando(false);
        control.current?.caminar(false);
      } else cerrarRef.current();
    };
    document.addEventListener("keydown", onKey);
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previo;
    };
  }, []);

  useEffect(() => {
    let vivo = true;
    Promise.all([import("@/croquis/motor"), cargarPredio(slug)])
      .then(([motor, p]) => {
        if (!vivo || !canvasRef.current || !p) {
          if (vivo) setEstado("error");
          return;
        }
        const movil = window.matchMedia("(max-width: 767px), (pointer: coarse)").matches;
        const reducirMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        control.current = motor.crearCroquis(canvasRef.current, p, {
          movil,
          reducirMovimiento,
          onZona: (z) => setZona(z),
          onMira: (t) => {
            if (!t) soltadoEn.current = Date.now();
            setMouseTomado(t);
          },
          onBaile: (activo) => setBailando(activo),
          onVista: (p) => setPrimera(p),
        });
        setPredio(p);
        setVista(p.vistas[0]?.id ?? "");
        setEstado("listo");
      })
      .catch((e) => {
        // Sin WebGL, o el chunk no llegó.
        if (import.meta.env.DEV) console.warn("[croquis]", e);
        if (vivo) setEstado("error");
      });
    return () => {
      vivo = false;
      control.current?.liberar();
      control.current = null;
    };
  }, [slug]);

  const elegirVista = (id: string) => {
    setVista(id);
    control.current?.verVista(id);
  };
  const elegirHora = (h: Hora) => {
    setHora(h);
    control.current?.ponerHora(h);
  };
  // Lo lee el reproductor de música cada 400 ms: más fuerte cerca del escenario.
  const volumenMusica = () => control.current?.volumenMusica() ?? 0.6;

  const ponerCaminata = (activo: boolean) => {
    setCaminando(activo);
    if (activo) setAvisoGiro(true);
    control.current?.caminar(activo);
  };

  // Las entradas de la zona donde se está parado.
  useEffect(() => {
    if (!caminando || !avisoGiro) return;
    const t = window.setTimeout(() => setAvisoGiro(false), 6000);
    return () => window.clearTimeout(t);
  }, [caminando, avisoGiro]);

  const zonaDatos = predio?.zonas.find((z) => z.id === zona?.id);
  const entradasZona = useMemo(
    () => (vende && evento ? entradasDeZona(zonaDatos, evento.tickets) : []),
    [vende, evento, zonaDatos]
  );

  const abrirCompra = (preseleccion?: string) => {
    control.current?.pausar(true);
    setComprando({ preseleccion });
  };
  const cerrarCompra = () => {
    setComprando(null);
    control.current?.pausar(false);
  };

  // La compra NO se abre sola al entrar a un sector (pedido del autor): queda
  // el botón naranja de abajo, que cambia con el sector donde se está.

  const actual = predio?.vistas.find((v) => v.id === vista);

  /** El link del mapa: en el celular abre el menú de compartir; si no, se copia. */
  const compartir = async () => {
    const url = `${SITIO}${urlDeMapa(slug)}`;
    const titulo = predio ? `Mapa 3D · ${predio.nombre}` : "Mapa 3D";
    try {
      if (navigator.share) {
        await navigator.share({ title: titulo, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Link del mapa copiado");
    } catch (e) {
      // Cerrar el menú de compartir no es un error.
      if ((e as Error)?.name !== "AbortError") toast.error("No se pudo copiar el link");
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[70] bg-[#060912] text-white"
      role="dialog"
      aria-modal="true"
      aria-label={predio ? `Mapa 3D de ${predio.nombre}` : "Mapa 3D del predio"}
    >
      <div className="absolute inset-0">
        <canvas ref={canvasRef} className="block h-full w-full touch-none" />
      </div>

      {estado !== "listo" && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
          {estado === "cargando" ? (
            <p className="animate-pulse text-sm tracking-wide text-white/70">Armando el predio…</p>
          ) : (
            <p className="max-w-xs text-sm text-white/80">
              No pudimos mostrar el mapa en este dispositivo. Probá desde otro navegador o desde una computadora.
            </p>
          )}
        </div>
      )}

      {/* Encabezado. En el celular (compacto) todo más chico: tapaba medio mapa. */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between bg-gradient-to-b from-black/70 to-transparent ${
          compacto
            ? "gap-2 px-3 pb-4 pt-[max(0.5rem,env(safe-area-inset-top))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]"
            : "gap-3 px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6"
        }`}
      >
        <div className="min-w-0">
          <h2 className={`truncate font-black tracking-tight ${compacto ? "text-base leading-tight" : "text-xl sm:text-2xl"}`}>
            {predio?.nombre ?? "Mapa del predio"}
          </h2>
          {/* Pedido del autor: que quede claro que es un juego en desarrollo. */}
          <p
            className={`inline-flex items-center rounded-full border border-[#F25C26]/60 bg-black/50 font-bold uppercase tracking-wide text-[#F25C26] ${
              compacto ? "mt-0.5 px-2 py-px text-[9px]" : "mt-1 px-2.5 py-0.5 text-[10px] sm:text-[11px]"
            }`}
          >
            Demo en desarrollo · versión cómica
          </p>
          {predio && !compacto && <p className="mt-0.5 line-clamp-2 text-xs text-white/70 sm:text-sm">{predio.subtitulo}</p>}
          {/* Debajo del nombre y no al lado de los botones: en un celular le
              comía el título entero. Caminando en el celular no va: abajo del
              sector ya está la compra de la zona. */}
          {compra && !(compacto && caminando) && (
            <Link
              to={compra.href}
              className={`pointer-events-auto inline-flex items-center rounded-full bg-[#F25C26] font-bold uppercase tracking-wide text-white transition-opacity hover:opacity-90 ${
                compacto ? "mt-1.5 h-8 px-3 text-[11px]" : "mt-2 h-10 px-4 text-xs sm:text-sm"
              }`}
            >
              {compra.texto}
            </Link>
          )}
        </div>
        <div className={`pointer-events-auto -mr-1 flex flex-shrink-0 items-start ${compacto ? "gap-1.5" : "gap-2"}`}>
          {predio?.musica && estado === "listo" && (
            <MusicaSoundcloud url={predio.musica.soundcloud} volumen={volumenMusica} auto chico={compacto} />
          )}
          <button
            type="button"
            onClick={() => void compartir()}
            className={`flex items-center justify-center rounded-full bg-white/10 backdrop-blur transition-colors hover:bg-white/20 ${compacto ? "h-9 w-9" : "h-11 w-11"}`}
            aria-label="Compartir el mapa"
          >
            <Share2 className={compacto ? "h-4 w-4" : "h-5 w-5"} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className={`flex items-center justify-center rounded-full bg-white/10 backdrop-blur transition-colors hover:bg-white/20 ${compacto ? "h-9 w-9" : "h-11 w-11"}`}
            aria-label="Cerrar el mapa"
          >
            <X className={compacto ? "h-4 w-4" : "h-5 w-5"} />
          </button>
        </div>
      </div>

      {/* Caminata: sector actual, palanca, correr y salir */}
      {predio && estado === "listo" && caminando && (
        <>
          {/* Arriba, debajo del encabezado. En el celular acá van también "Salir"
              y la compra de la zona: abajo están la palanca y "Correr". */}
          <div
            className={`pointer-events-none absolute inset-x-0 flex flex-col items-center gap-1.5 px-3 ${
              compacto
                ? "top-[calc(max(0.5rem,env(safe-area-inset-top))+3.6rem)]"
                : "top-[max(6.5rem,calc(env(safe-area-inset-top)+6rem))] sm:top-24"
            }`}
          >
            <div className="flex items-center gap-1.5">
              {compacto && (
                <button
                  type="button"
                  onClick={() => ponerCaminata(false)}
                  className="pointer-events-auto inline-flex h-8 items-center gap-1 rounded-full bg-white px-3 text-[11px] font-bold text-black shadow"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                  Salir
                </button>
              )}
              {zona && (
                <p
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-black/60 font-bold uppercase tracking-wide backdrop-blur ${
                    compacto ? "h-8 px-3 text-[11px]" : "px-4 py-2 text-xs sm:text-sm"
                  }`}
                >
                  <MapPin className={`text-[#F25C26] ${compacto ? "h-3.5 w-3.5" : "h-4 w-4"}`} aria-hidden />
                  {zona.nombre}
                </p>
              )}
            </div>
            {compacto && entradasZona.length > 0 && evento && (
              <button
                type="button"
                onClick={() => abrirCompra(entradasZona[0].name)}
                className="pointer-events-auto inline-flex h-8 max-w-full items-center gap-1.5 rounded-full bg-[#F25C26] px-3 text-[11px] font-bold text-white shadow-lg"
              >
                <Ticket className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
                <span className="truncate">
                  Comprar {entradasZona[0].name} · {fmtSimple(entradasZona[0].price, evento.currency)}
                </span>
              </button>
            )}
            {tactil && vertical && avisoGiro && (
              <p className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-black/60 py-1 pl-3 pr-1 text-[11px] text-white/90 backdrop-blur">
                Girá el celular para caminar más cómodo
                <button
                  type="button"
                  onClick={() => setAvisoGiro(false)}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15"
                  aria-label="Cerrar el aviso"
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </p>
            )}
          </div>
          {mouseTomado && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/85 shadow" />
          )}
          {tactil && (
            <>
              <div
                className={`absolute left-[max(1.25rem,env(safe-area-inset-left))] ${
                  compacto ? "bottom-[max(1rem,env(safe-area-inset-bottom))]" : "bottom-[max(1.25rem,env(safe-area-inset-bottom))]"
                }`}
              >
                <Joystick chico={compacto} onMover={(x, y) => control.current?.mover(x, y)} />
              </div>
              <button
                type="button"
                className={`absolute right-[max(1.25rem,env(safe-area-inset-right))] touch-none select-none rounded-full border border-white/25 bg-[#F25C26]/85 font-black uppercase tracking-wide shadow-lg active:bg-[#F25C26] ${
                  compacto
                    ? "bottom-[max(1.25rem,env(safe-area-inset-bottom))] h-16 w-16 text-[10px]"
                    : "bottom-[max(2.5rem,env(safe-area-inset-bottom))] h-20 w-20 text-xs"
                }`}
                onPointerDown={() => control.current?.correr(true)}
                onPointerUp={() => control.current?.correr(false)}
                onPointerCancel={() => control.current?.correr(false)}
                onPointerLeave={() => control.current?.correr(false)}
              >
                Correr
              </button>
            </>
          )}
          {/* Vista, bailar, tomar y fumar: a la derecha, arriba de "Correr" en el
              celular (ahí en dos columnas: en un teléfono acostado no entran cuatro).
              En compacto, sólo el ícono. */}
          <div
            className={`absolute right-[max(1.25rem,env(safe-area-inset-right))] grid gap-2 ${
              !tactil
                ? "bottom-28 grid-cols-1"
                : compacto
                  ? "bottom-[max(6.25rem,calc(env(safe-area-inset-bottom)+5.25rem))] grid-cols-2"
                  : "bottom-[max(8.5rem,calc(env(safe-area-inset-bottom)+7.5rem))] grid-cols-2"
            }`}
          >
            {[
              {
                id: "vista",
                onClick: () => {
                  control.current?.vista(!primera);
                  setPrimera(!primera);
                },
                Icono: primera ? Eye : PersonStanding,
                texto: primera ? "1ª pers." : "3ª pers.",
                titulo: "Cambiar de vista (V)",
                aria: primera ? "Pasar a tercera persona" : "Pasar a primera persona",
                activo: false,
              },
              { id: "bailar", onClick: () => control.current?.bailar(!bailando), Icono: Music, texto: "Bailar", titulo: "Bailar (B)", aria: "Bailar", activo: bailando },
              { id: "tomar", onClick: () => control.current?.tomar(), Icono: CupSoda, texto: "Tomar", titulo: "Tomar (T)", aria: "Tomar", activo: false },
              { id: "fumar", onClick: () => control.current?.fumar(), Icono: Cigarette, texto: "Fumar", titulo: "Fumar (F)", aria: "Fumar", activo: false },
            ].map(({ id, onClick, Icono, texto, titulo, aria, activo }) => (
              <button
                key={id}
                type="button"
                onClick={onClick}
                aria-pressed={id === "bailar" ? activo : undefined}
                aria-label={aria}
                title={tactil ? undefined : titulo}
                className={`flex flex-col items-center justify-center gap-0.5 rounded-full border font-bold uppercase shadow-lg backdrop-blur transition-colors ${
                  compacto ? "h-11 w-11" : "h-14 w-14 text-[10px]"
                } ${activo ? "border-[#F25C26] bg-[#F25C26] text-white" : "border-white/25 bg-black/60 text-white"}`}
              >
                <Icono className={compacto ? "h-[18px] w-[18px]" : "h-5 w-5"} aria-hidden />
                {!compacto && texto}
              </button>
            ))}
          </div>
          {!compacto && (
            <div className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
              {entradasZona.length > 0 && evento && (
                // La compra de la zona donde se está, siempre a un toque.
                <button
                  type="button"
                  onClick={() => abrirCompra(entradasZona[0].name)}
                  className="inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-full bg-[#F25C26] px-5 text-xs font-bold text-white shadow-lg sm:text-sm"
                >
                  <Ticket className="h-4 w-4" aria-hidden />
                  Comprar {entradasZona[0].name} · {fmtSimple(entradasZona[0].price, evento.currency)}
                </button>
              )}
              {!tactil && (
                <p className="whitespace-nowrap rounded-full bg-black/55 px-4 py-2 text-[11px] text-white/85 backdrop-blur sm:text-xs">
                  {mouseTomado ? (
                    <>
                      <b>WASD</b> caminar · <b>Shift</b> correr · <b>B</b> bailar · <b>T</b> tomar · <b>F</b> fumar · <b>V</b> vista · <b>Esc</b> suelta el mouse
                    </>
                  ) : (
                    <>
                      <b>Hacé click en el mapa</b> para mirar con el mouse · <b>WASD</b> caminar · <b>B</b> bailar · <b>T</b> tomar · <b>V</b> vista
                    </>
                  )}
                </p>
              )}
              <button
                type="button"
                onClick={() => ponerCaminata(false)}
                className="min-h-[40px] rounded-full bg-white px-5 text-xs font-bold text-black"
              >
                Salir de la caminata
              </button>
            </div>
          )}
        </>
      )}

      {/* Vistas, descripción y hora. En compacto: descripción en dos renglones,
          botones más bajos, las horas sólo con el ícono y sin la nota del pie. */}
      {predio && estado === "listo" && !caminando && (
        <div
          className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent ${
            compacto
              ? "space-y-1.5 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-6"
              : "space-y-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-10 sm:px-6"
          }`}
        >
          {actual && (
            <div className={`mx-auto max-w-2xl rounded-2xl border border-white/10 bg-black/55 backdrop-blur ${compacto ? "px-3 py-2" : "p-3 sm:p-4"}`}>
              <p className={`font-bold ${compacto ? "text-xs" : "text-sm"}`}>{actual.nombre}</p>
              <p className={`mt-0.5 text-white/80 ${compacto ? `${vertical ? "line-clamp-2" : "line-clamp-1"} text-[11px] leading-snug` : "text-xs leading-relaxed sm:text-sm"}`}>
                {actual.descripcion}
              </p>
            </div>
          )}
          <div
            className={`mx-auto flex max-w-4xl gap-2 overflow-x-auto pb-1 [scrollbar-width:none] ${
              compacto ? "" : "sm:flex-wrap sm:justify-center sm:overflow-visible"
            }`}
          >
            {predio.vistas.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => elegirVista(v.id)}
                className={`flex-shrink-0 rounded-full font-semibold transition-colors ${
                  compacto ? "min-h-[34px] px-3 text-[11px]" : "min-h-[40px] px-4 text-xs sm:text-sm"
                } ${v.id === vista ? "bg-[#F25C26] text-white" : "bg-white/10 text-white/85 hover:bg-white/20"}`}
                aria-pressed={v.id === vista}
              >
                {v.nombre}
              </button>
            ))}
          </div>
          <div className={`flex items-center justify-center gap-2 ${compacto ? "flex-nowrap" : "flex-wrap"}`}>
            <button
              type="button"
              onClick={() => ponerCaminata(true)}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#F25C26] bg-[#F25C26]/15 font-bold text-white transition-colors hover:bg-[#F25C26]/30 ${
                compacto ? "min-h-[34px] px-3 text-[11px]" : "min-h-[40px] px-4 text-xs"
              }`}
            >
              <Footprints className="h-4 w-4" aria-hidden />
              Caminar por el predio
            </button>
            {HORAS.map(({ id, nombre, icono: Icono }) => (
              <button
                key={id}
                type="button"
                onClick={() => elegirHora(id)}
                className={`inline-flex items-center gap-1.5 rounded-full text-xs font-semibold transition-colors ${
                  compacto ? "min-h-[34px] px-2.5" : "min-h-[40px] px-3"
                } ${id === hora ? "bg-white text-black" : "bg-white/10 text-white/80 hover:bg-white/20"}`}
                aria-pressed={id === hora}
                aria-label={nombre}
                title={nombre}
              >
                <Icono className="h-3.5 w-3.5" aria-hidden />
                {!compacto && nombre}
              </button>
            ))}
          </div>
          {!compacto && (
            <p className="text-center text-[10px] text-white/50">
              Croquis ilustrativo, no está a escala. Arrastrá para girar y pellizcá o usá la rueda para acercar.
            </p>
          )}
        </div>
      )}
      {comprando && evento && (
        <Suspense fallback={null}>
          <CompraEntradas
            isOpen
            encima
            onClose={cerrarCompra}
            eventId={evento.id}
            eventName={evento.name}
            eventDate={formatEventDate(evento.date)}
            eventLocation={evento.location}
            tickets={evento.tickets.filter((t) => t.active)}
            promos={evento.promos}
            preseleccion={comprando.preseleccion}
          />
        </Suspense>
      )}
    </div>,
    document.body
  );
};

export default CroquisVisor;
