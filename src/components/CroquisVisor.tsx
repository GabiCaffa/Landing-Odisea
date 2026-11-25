import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Moon, Sun, Sunset, X } from "lucide-react";
import type { Hora, Predio } from "@/croquis/tipos";
import type { ControlCroquis } from "@/croquis/motor";
import { cargarPredio } from "@/croquis/registro";

interface Props {
  slug: string;
  onClose: () => void;
}

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
const CroquisVisor = ({ slug, onClose }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const control = useRef<ControlCroquis | null>(null);
  const cerrarRef = useRef(onClose);
  cerrarRef.current = onClose;

  const [predio, setPredio] = useState<Predio | null>(null);
  const [estado, setEstado] = useState<"cargando" | "listo" | "error">("cargando");
  const [vista, setVista] = useState("");
  const [hora, setHora] = useState<Hora>("noche");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrarRef.current();
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
        control.current = motor.crearCroquis(canvasRef.current, p, { movil, reducirMovimiento });
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

  const actual = predio?.vistas.find((v) => v.id === vista);

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

      {/* Encabezado */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-black tracking-tight sm:text-2xl">{predio?.nombre ?? "Mapa del predio"}</h2>
          {predio && <p className="mt-0.5 line-clamp-2 text-xs text-white/70 sm:text-sm">{predio.subtitulo}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="pointer-events-auto -mr-1 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-white/10 backdrop-blur transition-colors hover:bg-white/20"
          aria-label="Cerrar el mapa"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Vistas, descripción y hora */}
      {predio && estado === "listo" && (
        <div className="absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-black/80 via-black/50 to-transparent px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-10 sm:px-6">
          {actual && (
            <div className="mx-auto max-w-2xl rounded-2xl border border-white/10 bg-black/55 p-3 backdrop-blur sm:p-4">
              <p className="text-sm font-bold">{actual.nombre}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-white/80 sm:text-sm">{actual.descripcion}</p>
            </div>
          )}
          <div className="mx-auto flex max-w-4xl gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:justify-center sm:overflow-visible">
            {predio.vistas.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => elegirVista(v.id)}
                className={`min-h-[40px] flex-shrink-0 rounded-full px-4 text-xs font-semibold transition-colors sm:text-sm ${
                  v.id === vista ? "bg-[#F25C26] text-white" : "bg-white/10 text-white/85 hover:bg-white/20"
                }`}
                aria-pressed={v.id === vista}
              >
                {v.nombre}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-center gap-2">
            {HORAS.map(({ id, nombre, icono: Icono }) => (
              <button
                key={id}
                type="button"
                onClick={() => elegirHora(id)}
                className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors ${
                  id === hora ? "bg-white text-black" : "bg-white/10 text-white/80 hover:bg-white/20"
                }`}
                aria-pressed={id === hora}
              >
                <Icono className="h-3.5 w-3.5" aria-hidden />
                {nombre}
              </button>
            ))}
          </div>
          <p className="text-center text-[10px] text-white/50">
            Croquis ilustrativo, no está a escala. Arrastrá para girar y pellizcá o usá la rueda para acercar.
          </p>
        </div>
      )}
    </div>,
    document.body
  );
};

export default CroquisVisor;
