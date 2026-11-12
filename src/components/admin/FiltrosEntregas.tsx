import { useState } from "react";
import { Calendar, SlidersHorizontal, X } from "lucide-react";
import { formatEventDate } from "@/contexts/AuthContext";
import {
  FiltrosEntregas as Filtros,
  OpcionEvento,
  OpcionPrecio,
  OpcionTipo,
  TODOS,
  filtrosEnDesplegables,
  hayFiltrosExtra,
  limpiarFiltros,
} from "@/lib/filtrosEntregas";

/**
 * La barra de filtros de Entregas. Presentacional; la lógica vive en
 * `src/lib/filtrosEntregas.ts`.
 *
 * - **Evento**: desplegable (con muchas fechas pasadas una fila de botones no
 *   entra).
 * - **Tipo y precio**: botones, porque son pocos por evento y son lo que más
 *   se toca ("ahora mando las VIP", "las del lote de $800").
 * - **Comprobante, origen, promo, fecha y orden**: cinco desplegables. En
 *   celular van plegados detrás de "Más filtros", con el número de los que
 *   están puestos: abiertos siempre eran tres filas antes de ver una venta.
 */
interface Props {
  filtros: Filtros;
  onChange: (f: Filtros) => void;
  eventos: OpcionEvento[];
  tipos: OpcionTipo[];
  precios: OpcionPrecio[];
}

const chip = (activo: boolean) =>
  `min-h-[36px] rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
    activo
      ? "border-foreground bg-foreground text-background"
      : "border-border bg-background text-muted-foreground hover:bg-secondary"
  }`;

const plata = (n: number) => `$${n.toLocaleString("es-UY")}`;

const FiltrosEntregas = ({ filtros, onChange, eventos, tipos, precios }: Props) => {
  const [abierto, setAbierto] = useState(false);
  const set = <K extends keyof Filtros>(k: K, v: Filtros[K]) => onChange({ ...filtros, [k]: v });
  const proximos = eventos.filter((e) => !e.pasado);
  const pasados = eventos.filter((e) => e.pasado);
  const etiqueta = (e: OpcionEvento) => (e.fecha ? `${e.nombre} · ${formatEventDate(e.fecha)}` : e.nombre);
  const puestos = filtrosEnDesplegables(filtros);
  // Con un solo precio el filtro no separa nada; se muestra igual si quedó puesto.
  const conPrecios = precios.length > 1 || filtros.precio !== TODOS;

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2">
          <Calendar className="h-4 w-4 flex-shrink-0 text-celeste-deep" aria-hidden="true" />
          <span className="sr-only">Evento</span>
          <select
            value={filtros.evento}
            // Al cambiar de evento el tipo y el precio dejan de tener sentido:
            // el "VIP" y los lotes de una fecha no son los de otra.
            onChange={(e) => onChange({ ...filtros, evento: e.target.value, tipo: TODOS, precio: TODOS })}
            className="input-techno min-w-0 flex-1 font-semibold"
          >
            {proximos.length > 0 && (
              <optgroup label="Próximos">
                {proximos.map((e) => (
                  <option key={e.id} value={e.id}>
                    {etiqueta(e)}
                  </option>
                ))}
              </optgroup>
            )}
            {pasados.length > 0 && (
              <optgroup label="Pasados">
                {pasados.map((e) => (
                  <option key={e.id} value={e.id}>
                    {etiqueta(e)}
                  </option>
                ))}
              </optgroup>
            )}
            <option value={TODOS}>Todos los eventos</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          aria-controls="mas-filtros-entregas"
          className={`relative inline-flex h-11 flex-shrink-0 items-center gap-2 rounded-full border px-3 text-xs font-semibold md:hidden ${
            abierto || puestos > 0 ? "border-celeste text-celeste-deep" : "border-border text-muted-foreground"
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filtros
          {puestos > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-celeste px-1 text-[11px] font-bold text-white">
              {puestos}
            </span>
          )}
        </button>
      </div>

      <div id="mas-filtros-entregas" className={`grid-cols-2 gap-2 md:grid md:grid-cols-3 xl:grid-cols-5 ${abierto ? "grid" : "hidden"}`}>
        <select
          value={filtros.comprobante}
          onChange={(e) => set("comprobante", e.target.value as Filtros["comprobante"])}
          className="input-techno"
          aria-label="Comprobante"
        >
          <option value={TODOS}>Comprobante</option>
          <option value="con">Con comprobante</option>
          <option value="sin">Sin comprobante</option>
        </select>
        <select
          value={filtros.origen}
          onChange={(e) => set("origen", e.target.value as Filtros["origen"])}
          className="input-techno"
          aria-label="Origen"
        >
          <option value={TODOS}>Origen</option>
          <option value="web">De la web</option>
          <option value="manual">A mano</option>
        </select>
        <select
          value={filtros.promo}
          onChange={(e) => set("promo", e.target.value as Filtros["promo"])}
          className="input-techno"
          aria-label="Promo"
        >
          <option value={TODOS}>Promo</option>
          <option value="con">Con promo</option>
          <option value="sin">Sin promo</option>
        </select>
        <select
          value={filtros.fecha}
          onChange={(e) => set("fecha", e.target.value as Filtros["fecha"])}
          className="input-techno"
          aria-label="Fecha de carga"
        >
          <option value={TODOS}>Fecha</option>
          <option value="hoy">Hoy</option>
          <option value="ayer">Ayer</option>
          <option value="semana">Últimos 7 días</option>
        </select>
        <select
          value={filtros.orden}
          onChange={(e) => set("orden", e.target.value as Filtros["orden"])}
          className="input-techno col-span-2 md:col-span-1"
          aria-label="Orden"
        >
          <option value="nuevas">Más nuevas primero</option>
          <option value="espera">Las que más esperan</option>
          <option value="monto">Mayor monto</option>
          <option value="nombre">Por nombre</option>
        </select>
      </div>

      {tipos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Tipo de entrada">
          <span className="w-12 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tipo</span>
          <button type="button" onClick={() => set("tipo", TODOS)} className={chip(filtros.tipo === TODOS)}>
            Todas
          </button>
          {tipos.map((t) => (
            <button
              key={t.id}
              type="button"
              // El precio se suelta: los lotes de un tipo no son los de otro.
              onClick={() => onChange({ ...filtros, tipo: t.id, precio: TODOS })}
              className={chip(filtros.tipo === t.id)}
              aria-pressed={filtros.tipo === t.id}
            >
              {t.nombre} <span className="opacity-70">({t.ventas})</span>
            </button>
          ))}
        </div>
      )}

      {conPrecios && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Precio de la entrada">
          <span className="w-12 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Precio</span>
          <button type="button" onClick={() => set("precio", TODOS)} className={chip(filtros.precio === TODOS)}>
            Todos
          </button>
          {precios.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => set("precio", p.id)}
              className={chip(filtros.precio === p.id)}
              aria-pressed={filtros.precio === p.id}
            >
              {plata(p.precio)} <span className="opacity-70">({p.ventas})</span>
            </button>
          ))}
        </div>
      )}

      {hayFiltrosExtra(filtros) && (
        <button
          type="button"
          onClick={() => onChange(limpiarFiltros(filtros))}
          className="inline-flex min-h-[36px] items-center gap-1 text-xs font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          <X className="h-3.5 w-3.5" /> Limpiar filtros
        </button>
      )}
    </div>
  );
};

export default FiltrosEntregas;
