import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { GaleriaItem, useGaleria } from "@/lib/galeria";
import { imagenRedimensionada, srcSetRedimensionado } from "@/lib/imagenes";
import { claseDeMosaico, tamanosDeMosaico } from "@/lib/mosaico";

/**
 * Galería de eventos anteriores: un mosaico de fotos y videos de fiestas que ya
 * pasaron, bajo Promociones. Se carga desde el panel (pestaña Galería, v33).
 *
 * **Sin ningún item activo no se renderiza nada, ni el título** (misma regla que
 * `PromosActivasSection`): una sección vacía en una web que vende es ruido. El
 * botón "Eventos anteriores" del header sigue la misma condición.
 *
 * **Los videos no se descargan hasta que se tocan.** En la grilla se ve su
 * póster (un cuadro suelto que se genera al subirlo) y un botón de play; el
 * archivo recién se pide al abrir el visor. Con datos móviles, diez videos de
 * 10 MB bajados "por las dudas" son la web más lenta del barrio.
 */

const DE_A = 8;

const Miniatura = ({ item, grande }: { item: GaleriaItem; grande: boolean }) => {
  const imagen = item.kind === "video" ? item.posterUrl : item.url;

  return imagen ? (
    <img
      src={imagenRedimensionada(imagen, grande ? 800 : 480)}
      srcSet={srcSetRedimensionado(imagen) || undefined}
      sizes={grande ? "(min-width: 768px) 50vw, 100vw" : "(min-width: 768px) 25vw, 50vw"}
      alt={item.caption}
      loading="lazy"
      decoding="async"
      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
    />
  ) : (
    // Video sin póster (no se pudo decodificar al subirlo): el propio navegador
    // muestra el primer cuadro con `preload="metadata"`.
    <video
      src={`${item.url}#t=0.5`}
      preload="metadata"
      muted
      playsInline
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
};

/** El visor a pantalla completa: la foto grande o el video con controles. */
const Visor = ({
  items,
  indice,
  onCambiar,
  onCerrar,
}: {
  items: GaleriaItem[];
  indice: number;
  onCambiar: (i: number) => void;
  onCerrar: () => void;
}) => {
  const item = items[indice];
  const inicioX = useRef<number | null>(null);

  const ir = useCallback(
    (delta: number) => onCambiar((indice + delta + items.length) % items.length),
    [indice, items.length, onCambiar]
  );

  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
      if (e.key === "ArrowLeft") ir(-1);
      if (e.key === "ArrowRight") ir(1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previo;
      window.removeEventListener("keydown", onKey);
    };
  }, [ir, onCerrar]);

  const boton =
    "absolute z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/25";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item.caption || "Galería"}
      className="fixed inset-0 z-[100] flex h-[100dvh] items-center justify-center bg-black/90"
      // Tocar el fondo cierra; tocar el archivo o los botones no.
      onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}
      onTouchStart={(e) => (inicioX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (inicioX.current === null) return;
        const dx = e.changedTouches[0].clientX - inicioX.current;
        inicioX.current = null;
        if (Math.abs(dx) > 60) ir(dx < 0 ? 1 : -1);
      }}
    >
      <button type="button" onClick={onCerrar} aria-label="Cerrar" className={`${boton} right-3 top-3`}>
        <X className="h-5 w-5" />
      </button>

      {items.length > 1 && (
        <>
          <button type="button" onClick={() => ir(-1)} aria-label="Anterior" className={`${boton} left-3 top-1/2 -translate-y-1/2`}>
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => ir(1)} aria-label="Siguiente" className={`${boton} right-3 top-1/2 -translate-y-1/2`}>
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}

      <figure className="flex max-h-full max-w-full flex-col items-center px-14 py-16 sm:px-20">
        {item.kind === "video" ? (
          <video
            // `key` para que al pasar de un video a otro se pida el nuevo y no
            // se reutilice el elemento con el archivo anterior.
            key={item.id}
            src={item.url}
            poster={item.posterUrl ? imagenRedimensionada(item.posterUrl, 960) : undefined}
            controls
            autoPlay
            playsInline
            className="max-h-[75dvh] max-w-full rounded-xl bg-black"
          />
        ) : (
          <img
            key={item.id}
            src={imagenRedimensionada(item.url, 1600)}
            alt={item.caption}
            className="max-h-[75dvh] max-w-full rounded-xl object-contain"
          />
        )}
        {item.caption && (
          <figcaption className="mt-3 text-center text-sm font-semibold uppercase tracking-wide text-white/90">
            {item.caption}
          </figcaption>
        )}
        <p className="mt-1 text-xs text-white/50">
          {indice + 1} / {items.length}
        </p>
      </figure>
    </div>,
    document.body
  );
};

/**
 * El contenido va en su propio componente, que sólo se monta cuando ya hay
 * items: `useScrollReveal` engancha su observer en el primer efecto, y si el
 * título todavía no existe (los datos llegan async) el ref está vacío y nunca
 * se engancha — el título quedaría invisible para siempre.
 */
const Contenido = ({ items }: { items: GaleriaItem[] }) => {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.1 });
  const [visibles, setVisibles] = useState(DE_A);
  const [abierto, setAbierto] = useState<number | null>(null);
  const mostrados = items.slice(0, visibles);
  // Tamaño de cada foto, con la cola ajustada para que el mosaico no deje huecos.
  const tamanos = useMemo(() => tamanosDeMosaico(mostrados.length), [mostrados.length]);

  return (
    <section id="anteriores" className="scroll-mt-20 bg-secondary/40 py-10 md:py-14">
      <div className="container-odisea">
        <div
          ref={ref}
          className={`mb-6 text-center transition-all duration-700 md:mb-8 ${
            isVisible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
          }`}
        >
          <p className="eyebrow mb-2">Recuerdos</p>
          <h2 className="title-sport text-4xl text-tinta sm:text-5xl md:text-6xl">
            EVENTOS <span className="highlight-celeste">ANTERIORES</span>
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-2 [grid-auto-flow:dense] md:grid-cols-4 md:gap-3">
          {mostrados.map((item, i) => {
            const grande = tamanos[i] === "g";
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setAbierto(i)}
                aria-label={`${item.kind === "video" ? "Ver video" : "Ver foto"}${item.caption ? `: ${item.caption}` : ""}`}
                className={`group relative overflow-hidden rounded-2xl bg-secondary text-left ${claseDeMosaico(tamanos[i])}`}
              >
                <Miniatura item={item} grande={grande} />

                {/* Degradé para que el epígrafe se lea sobre cualquier foto. */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

                {item.kind === "video" && (
                  <span className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-celeste text-accent-foreground shadow-lg transition-transform duration-300 group-hover:scale-110">
                    <Play className="h-5 w-5 translate-x-px fill-current" />
                  </span>
                )}

                {item.caption && (
                  <span
                    className={`absolute bottom-0 left-0 right-0 p-3 font-semibold uppercase leading-tight tracking-wide text-white ${
                      grande ? "text-sm md:text-base" : "text-[11px] md:text-xs"
                    }`}
                  >
                    {item.caption}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {visibles < items.length && (
          <div className="mt-5 flex justify-center">
            <button
              type="button"
              onClick={() => setVisibles((v) => v + DE_A)}
              className="btn-techno-outline min-h-[44px] px-6 text-xs"
            >
              Ver más
            </button>
          </div>
        )}
      </div>

      {abierto !== null && (
        <Visor
          items={mostrados}
          indice={abierto}
          onCambiar={setAbierto}
          onCerrar={() => setAbierto(null)}
        />
      )}
    </section>
  );
};

const GaleriaAnteriores = () => {
  const items = useGaleria();
  if (!items || items.length === 0) return null;
  return <Contenido items={items} />;
};

export default GaleriaAnteriores;
