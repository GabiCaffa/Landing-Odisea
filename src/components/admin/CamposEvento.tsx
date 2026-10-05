import { useEffect, useMemo, useRef, useState } from "react";
import {
  Crop,
  Image as ImageIcon,
  Maximize2,
  Move,
  RotateCcw,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  AdminEvent,
  DEFAULT_IMAGE_TRANSFORM,
  ImageTransform,
} from "@/contexts/AuthContext";
import { EventTicket, TicketType, sortEventTickets } from "@/lib/ticketTypes";

// Vivía suelto en Admin.tsx, al lado de los componentes que se movieron.
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
import { ArrowRight } from "lucide-react";
import { useCartelEventos } from "@/contexts/ThemeContext";

/**
 * Piezas del formulario de evento que usan DOS pantallas: el formulario de un
 * evento suelto y el de una fiesta de varios días.
 *
 * **Viven acá y no en `Admin.tsx` por una razón concreta**: si
 * `FiestaFormModal` las importara de ahí quedaría un import circular
 * —`Admin` importa el modal, el modal importa `Admin`—. Hoy Rollup lo
 * resuelve, pero depende de que nadie use estos valores durante la evaluación
 * del módulo, y eso es una promesa que nadie puede sostener a futuro.
 */

export const FormField = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="block text-xs tracking-[0.2em] uppercase text-muted-foreground mb-2">
      {label}
    </span>
    {children}
  </label>
);

/**
 * Elegir qué tipos vende el evento y a qué precio. El precio vive acá y no en
 * el catálogo porque el mismo "VIP" vale distinto en cada fecha.
 */
export const TicketsEditor = ({
  catalog,
  value,
  onChange,
}: {
  catalog: TicketType[];
  value: EventTicket[];
  onChange: (tickets: EventTicket[]) => void;
}) => {
  const selected = useMemo(
    () => new Map(value.map((t) => [t.ticketTypeId, t])),
    [value]
  );

  // Se ofrecen los tipos activos; los inactivos sólo si el evento ya los vendía
  // (si no, al editar un evento viejo se le borraría una entrada sin avisar).
  const options = useMemo(
    () => catalog.filter((t) => t.active || selected.has(t.id)),
    [catalog, selected]
  );

  const toggle = (type: TicketType) => {
    if (selected.has(type.id)) {
      onChange(value.filter((t) => t.ticketTypeId !== type.id));
      return;
    }
    onChange(
      sortEventTickets([
        ...value,
        {
          ticketTypeId: type.id,
          name: type.name,
          description: type.description,
          price: 0,
          active: true,
          sortOrder: type.sortOrder,
          // Viene del catálogo (v28). Se copia acá para que el formulario y el
          // modal de compra puedan rotularlo sin volver a consultar.
          isAbono: type.isAbono,
        },
      ])
    );
  };

  const setPrice = (typeId: string, price: number) =>
    onChange(value.map((t) => (t.ticketTypeId === typeId ? { ...t, price } : t)));

  const setActive = (typeId: string, active: boolean) =>
    onChange(value.map((t) => (t.ticketTypeId === typeId ? { ...t, active } : t)));

  // Vacío = no se informa ('null' se manda a la base como NULL).
  const setStock = (typeId: string, raw: string) =>
    onChange(
      value.map((t) =>
        t.ticketTypeId === typeId
          ? { ...t, stockRemaining: raw === "" ? null : Math.max(0, Math.floor(Number(raw))) }
          : t
      )
    );

  if (options.length === 0) {
    return (
      <p className="text-xs text-muted-foreground border border-dashed border-border p-4">
        No hay tipos de entrada cargados. Creá al menos uno en la pestaña{" "}
        <strong>Entradas</strong>.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {options.map((type) => {
        const row = selected.get(type.id);
        return (
          <div
            key={type.id}
            className={`border p-3 ${row ? "border-foreground" : "border-border"}`}
          >
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={!!row}
                onChange={() => toggle(type)}
                className="accent-foreground flex-shrink-0"
                aria-label={`Vender ${type.name}`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {type.name}
                  {!type.active && (
                    <span className="ml-2 text-[10px] tracking-wider uppercase text-muted-foreground">
                      (tipo inactivo)
                    </span>
                  )}
                </p>
                {type.description && (
                  <p className="text-[11px] text-muted-foreground line-clamp-1">
                    {type.description}
                  </p>
                )}
              </div>
              {row && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-sm text-muted-foreground">$</span>
                  <input
                    type="number"
                    min={0}
                    value={row.price || ""}
                    onChange={(e) => setPrice(type.id, Number(e.target.value))}
                    className="input-techno w-24 text-right"
                    placeholder="0"
                    aria-label={`Precio de ${type.name}`}
                  />
                </div>
              )}
            </div>

            {row && (
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground mt-2 ml-7 cursor-pointer">
                <input
                  type="checkbox"
                  checked={row.active}
                  onChange={(e) => setActive(type.id, e.target.checked)}
                  className="accent-foreground"
                />
                A la venta (destildá para ocultarla sin perder el precio)
              </label>
            )}

            {row && (
              <div className="mt-2 ml-7">
                <label className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  Quedan
                  <input
                    type="number"
                    min={0}
                    value={row.stockRemaining ?? ""}
                    onChange={(e) => setStock(type.id, e.target.value)}
                    className="input-techno w-20 text-right"
                    placeholder="—"
                    aria-label={`Entradas que quedan de ${type.name} antes del cambio de lote`}
                  />
                  entradas antes del cambio de lote
                </label>
                <p className="mt-1 text-[11px] text-muted-foreground/80">
                  Opcional. Se muestra tal cual en la web: <strong>mantenelo al día</strong> con
                  las ventas, o dejalo vacío para no mostrar nada.
                </p>
              </div>
            )}
          </div>
        );
      })}
      <p className="text-[11px] text-muted-foreground">
        El evento no tiene precio propio: el comprador elige cuántas de cada tipo y el
        total se calcula solo.
      </p>
    </div>
  );
};

// ─── Sugerencias que se aceptan con Tab ─────────────────────────────────────

/**
 * Hace que un campo vacío acepte con **Tab** lo que muestra su placeholder.
 *
 * Varios campos del panel proponen un valor y lo muestran en gris —el nombre
 * de cada día de una fiesta, la dirección de la página—. Hasta ahora eso era
 * decorativo: había que retipearlo entero. Pedido del autor: que se complete
 * con Tab, como en una terminal.
 *
 * **Sólo secuestra Tab cuando hay algo que completar**, o sea con el campo
 * vacío y una sugerencia disponible. En cualquier otro caso Tab navega como
 * siempre, que es lo que espera quien usa el teclado para moverse por el
 * formulario. `Shift+Tab` nunca se toca: va hacia atrás y ahí completar no
 * tiene sentido.
 *
 * Después de aceptar, el foco **se queda en el campo**: lo normal es querer
 * ajustar lo que acaba de entrar. Un segundo Tab ya navega, porque el campo
 * dejó de estar vacío.
 */
export const useAceptarConTab = (
  value: string,
  sugerencia: string,
  onChange: (v: string) => void
) => {
  const hayQueCompletar = !value.trim() && !!sugerencia.trim();

  return (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Tab" || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
    if (!hayQueCompletar) return;
    e.preventDefault();
    onChange(sugerencia);
  };
};

/** El aviso de que se puede completar con Tab. Se muestra sólo cuando aplica:
 *  una pista permanente al lado de un campo ya lleno es ruido. */
export const PistaTab = ({ visible }: { visible: boolean }) =>
  visible ? (
    <p className="mt-1 text-[11px] text-muted-foreground">
      Apretá <kbd className="rounded border border-border px-1 font-sans">Tab</kbd> para
      completar con lo que dice en gris.
    </p>
  ) : null;


// ─── Encuadre del flyer ─────────────────────────────────────────────────────

/**
 * La vista previa de la tarjeta con el flyer arrastrable, y sus controles.
 *
 * **Vivían en `Admin.tsx` y se movieron acá** cuando el formulario de fiesta
 * de varios días también necesitó encuadrar la imagen: duplicar la lógica de
 * arrastre y zoom era garantizar que algún día las dos se comportaran
 * distinto, e importarlas de `Admin.tsx` habría vuelto a armar el import
 * circular que este archivo existe para evitar.
 */

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const SCALE_STEP = 0.1;

export const ImageEditorControls = ({
  transform,
  setTransform,
  onChangeImage,
  uploading,
}: {
  transform: ImageTransform;
  setTransform: (updater: (p: ImageTransform) => ImageTransform) => void;
  onChangeImage: () => void;
  uploading: boolean;
}) => {
  const zoomIn = () =>
    setTransform((p) => ({ ...p, scale: clamp(p.scale + SCALE_STEP, MIN_SCALE, MAX_SCALE) }));
  const zoomOut = () =>
    setTransform((p) => ({ ...p, scale: clamp(p.scale - SCALE_STEP, MIN_SCALE, MAX_SCALE) }));

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Move className="w-3.5 h-3.5" />
        Arrastrá sobre el preview o usá los controles
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block">
          <span className="block text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-1">
            Pos X · {Math.round(transform.x)}%
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={transform.x}
            onChange={(e) => setTransform((p) => ({ ...p, x: +e.target.value }))}
            className="w-full accent-foreground"
          />
        </label>
        <label className="block">
          <span className="block text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-1">
            Pos Y · {Math.round(transform.y)}%
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={transform.y}
            onChange={(e) => setTransform((p) => ({ ...p, y: +e.target.value }))}
            className="w-full accent-foreground"
          />
        </label>
        <label className="block">
          <span className="block text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-1">
            Zoom · {transform.scale.toFixed(1)}x
          </span>
          <input
            type="range"
            min={MIN_SCALE}
            max={MAX_SCALE}
            step={SCALE_STEP}
            value={transform.scale}
            onChange={(e) => setTransform((p) => ({ ...p, scale: +e.target.value }))}
            className="w-full accent-foreground"
          />
        </label>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={zoomOut}
          className="p-2 border border-border hover:bg-secondary transition-colors"
          aria-label="Reducir zoom"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={zoomIn}
          className="p-2 border border-border hover:bg-secondary transition-colors"
          aria-label="Aumentar zoom"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() =>
            setTransform((p) => ({ ...p, fit: p.fit === "cover" ? "contain" : "cover" }))
          }
          className={`inline-flex items-center gap-2 text-xs tracking-wider uppercase border px-3 py-2 transition-colors ${
            transform.fit === "contain"
              ? "border-foreground bg-foreground text-background"
              : "border-border hover:bg-secondary"
          }`}
        >
          {transform.fit === "contain" ? (
            <>
              <Maximize2 className="w-3.5 h-3.5" /> Ver entera
            </>
          ) : (
            <>
              <Crop className="w-3.5 h-3.5" /> Llenar card
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => setTransform(() => ({ ...DEFAULT_IMAGE_TRANSFORM }))}
          className="inline-flex items-center gap-2 text-xs tracking-wider uppercase border border-border px-3 py-2 hover:bg-secondary transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </button>
        <button
          type="button"
          onClick={onChangeImage}
          disabled={uploading}
          className="ml-auto inline-flex items-center gap-2 text-xs tracking-wider uppercase border border-border px-3 py-2 hover:bg-foreground hover:text-background transition-colors"
        >
          <Upload className="w-3.5 h-3.5" />
          {uploading ? "Cargando..." : "Cambiar"}
        </button>
      </div>
    </div>
  );
};

export const EventCardPreview = ({
  image,
  imagePosition,
  setImagePosition,
  name,
  date,
  location,
  description,
  status,
}: {
  image: string;
  imagePosition: ImageTransform;
  setImagePosition: (updater: (p: ImageTransform) => ImageTransform) => void;
  name: string;
  date: string;
  location: string;
  description: string;
  status: AdminEvent["status"];
}) => {
  // El botón de la tarjeta real lleva el cartel del sitio (ver EventCard).
  const cartel = useCartelEventos();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragState = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  // Wheel zoom (non-passive listener so preventDefault funciona)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !image) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -SCALE_STEP : SCALE_STEP;
      setImagePosition((p) => ({
        ...p,
        scale: clamp(+(p.scale + delta).toFixed(2), MIN_SCALE, MAX_SCALE),
      }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [image, setImagePosition]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!image) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: imagePosition.x,
      origY: imagePosition.y,
    };
    setDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragState.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    // Drag → desplaza el foco. Sensibilidad ajustada por zoom y modo de fit.
    const sensitivity = imagePosition.fit === "contain" ? 1 : Math.max(imagePosition.scale, 1);
    const newX = clamp(
      dragState.current.origX - (dx / rect.width) * 100 / sensitivity,
      0,
      100
    );
    const newY = clamp(
      dragState.current.origY - (dy / rect.height) * 100 / sensitivity,
      0,
      100
    );
    setImagePosition((p) => ({ ...p, x: newX, y: newY }));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragState.current) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
    dragState.current = null;
    setDragging(false);
  };

  return (
    <article className="card-techno overflow-hidden flex flex-col w-full max-w-[320px] mx-auto shadow-lg">
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`relative aspect-[4/3] bg-secondary overflow-hidden select-none touch-none ${
          image ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-default"
        }`}
        style={
          imagePosition.fit === "contain"
            ? { backgroundImage: "linear-gradient(45deg,#0001 25%,transparent 25%),linear-gradient(-45deg,#0001 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#0001 75%),linear-gradient(-45deg,transparent 75%,#0001 75%)", backgroundSize: "12px 12px", backgroundPosition: "0 0,0 6px,6px -6px,-6px 0" }
            : undefined
        }
      >
        {image ? (
          <img
            src={image}
            alt={name}
            draggable={false}
            className="w-full h-full pointer-events-none transition-transform duration-100"
            style={{
              objectFit: imagePosition.fit,
              objectPosition: `${imagePosition.x}% ${imagePosition.y}%`,
              transform: `scale(${imagePosition.scale})`,
              transformOrigin: `${imagePosition.x}% ${imagePosition.y}%`,
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <ImageIcon className="w-12 h-12" />
          </div>
        )}

        {/* Grid guide al arrastrar */}
        {dragging && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-0 border border-white/30" />
            <div className="absolute left-1/3 top-0 bottom-0 border-l border-white/20" />
            <div className="absolute left-2/3 top-0 bottom-0 border-l border-white/20" />
            <div className="absolute top-1/3 left-0 right-0 border-t border-white/20" />
            <div className="absolute top-2/3 left-0 right-0 border-t border-white/20" />
          </div>
        )}

        <div className="absolute top-4 left-4 bg-background/95 backdrop-blur-sm px-3 py-1.5 pointer-events-none">
          <span className="text-xs tracking-wider uppercase">{date}</span>
        </div>

        {status === "agotado" && (
          <div className="absolute inset-0 bg-foreground/60 flex items-center justify-center pointer-events-none">
            <span className="title-sport text-2xl font-black tracking-widest text-background border-2 border-background px-3 py-1 -rotate-6">
              AGOTADO
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col flex-1 p-4">
        <h3 className="text-xl md:text-2xl tracking-wide mb-2">{name}</h3>
        <div className="flex items-center gap-2 text-muted-foreground mb-3">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-sm">{location}</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 mb-4 flex-1">
          {description}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled
            className="btn-celeste flex-1 text-xs font-bold uppercase py-3 px-3 cursor-default"
          >
            <span>
              {status === "agotado"
                ? "Ver la fecha"
                : cartel
                  ? `Comprar · ${cartel}`
                  : "Comprar entradas"}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </article>
  );
};
