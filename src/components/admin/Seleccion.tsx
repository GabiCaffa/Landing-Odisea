import { CheckSquare, Trash2, X } from "lucide-react";
import type { Seleccion } from "@/lib/seleccion";

/** Casillas, botón y barra de la selección múltiple (lógica en `src/lib/seleccion.ts`). */

/** Casilla de 44 px de toque (la caja visible es chica, el área no). */
export const Casilla = ({
  checked,
  onChange,
  etiqueta,
  indeterminada = false,
}: {
  checked: boolean;
  onChange: () => void;
  etiqueta: string;
  indeterminada?: boolean;
}) => (
  <label className="-m-2.5 flex h-11 w-11 flex-shrink-0 cursor-pointer items-center justify-center">
    <input
      type="checkbox"
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = indeterminada && !checked;
      }}
      onChange={onChange}
      aria-label={etiqueta}
      className="h-5 w-5 cursor-pointer accent-celeste"
    />
  </label>
);

/** El botón de la barra de herramientas que entra al modo selección. */
export const BotonSeleccionar = ({ s }: { s: Seleccion }) => (
  <button
    type="button"
    onClick={s.activo ? s.salir : s.entrar}
    className={`btn-techno-outline whitespace-nowrap px-4 sm:px-7 ${s.activo ? "!border-celeste !text-celeste-deep" : ""}`}
    title="Seleccionar varias para borrarlas de una"
    aria-pressed={s.activo}
  >
    <CheckSquare className="h-4 w-4" /> <span className="hidden sm:inline">{s.activo ? "Listo" : "Seleccionar"}</span>
  </button>
);

/**
 * La barra fija de abajo mientras se selecciona. En celular va ARRIBA de la
 * barra de navegación del panel (64 px), si no la tapaba.
 */
export const BarraSeleccion = ({
  s,
  total,
  nombre,
  onBorrar,
  borrando,
}: {
  s: Seleccion;
  /** Cuántas filas se están viendo. */
  total: number;
  /** "venta"/"ventas", para los textos. */
  nombre: [string, string];
  onBorrar: () => void;
  borrando: boolean;
}) => {
  if (!s.activo) return null;
  const n = s.elegidas.length;
  return (
    <>
    {/* Lugar al final de la lista para que la barra no tape la última fila. */}
    <div className="h-20" aria-hidden="true" />
    <div className="fixed inset-x-0 bottom-[calc(68px+env(safe-area-inset-bottom))] z-40 px-3 md:bottom-4 md:left-64 md:px-8">
      <div
        className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-xl border border-border bg-popover p-2 pl-4"
        style={{ boxShadow: "var(--shadow-lg)" }}
      >
        <p className="mr-auto text-sm font-semibold">
          {n} {n === 1 ? nombre[0] : nombre[1]}
          <span className="font-normal text-muted-foreground"> de {total}</span>
        </p>
        <button
          type="button"
          onClick={n === total ? s.ninguna : s.todas}
          className="min-h-11 rounded-lg px-3 text-sm font-semibold hover:bg-secondary"
        >
          {n === total && total > 0 ? "Ninguna" : "Todas"}
        </button>
        <button
          type="button"
          onClick={onBorrar}
          disabled={n === 0 || borrando}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-charrua px-4 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
        >
          <Trash2 className="h-4 w-4" /> {borrando ? "Borrando…" : `Borrar${n ? ` ${n}` : ""}`}
        </button>
        <button
          type="button"
          onClick={s.salir}
          aria-label="Salir de la selección"
          className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
    </>
  );
};
