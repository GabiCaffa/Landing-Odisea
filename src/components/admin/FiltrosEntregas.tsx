import { Calendar, X } from "lucide-react";
import { formatEventDate } from "@/contexts/AuthContext";
import {
  FILTROS_INICIALES,
  FiltrosEntregas as Filtros,
  OpcionEvento,
  OpcionTipo,
  TODOS,
  hayFiltrosExtra,
} from "@/lib/filtrosEntregas";

/**
 * La barra de filtros de Entregas: evento, tipo de entrada, comprobante y
 * origen. Presentacional; la lógica vive en `src/lib/filtrosEntregas.ts`.
 *
 * El evento es un desplegable (con muchas fechas pasadas una fila de botones
 * no entra) y el tipo de entrada son botones, porque son pocos por evento y
 * es el filtro que más se toca: "ahora mando las VIP".
 */
interface Props {
  filtros: Filtros;
  onChange: (f: Filtros) => void;
  eventos: OpcionEvento[];
  tipos: OpcionTipo[];
}

const chip = (activo: boolean) =>
  `min-h-[36px] rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
    activo
      ? "border-foreground bg-foreground text-background"
      : "border-border bg-background text-muted-foreground hover:bg-secondary"
  }`;

const FiltrosEntregas = ({ filtros, onChange, eventos, tipos }: Props) => {
  const set = <K extends keyof Filtros>(k: K, v: Filtros[K]) => onChange({ ...filtros, [k]: v });
  const proximos = eventos.filter((e) => !e.pasado);
  const pasados = eventos.filter((e) => e.pasado);
  const etiqueta = (e: OpcionEvento) => (e.fecha ? `${e.nombre} · ${formatEventDate(e.fecha)}` : e.nombre);

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <label className="flex min-w-0 flex-1 items-center gap-2">
          <Calendar className="h-4 w-4 flex-shrink-0 text-celeste-deep" aria-hidden="true" />
          <span className="sr-only">Evento</span>
          <select
            value={filtros.evento}
            // Al cambiar de evento el tipo de entrada deja de tener sentido:
            // el "VIP" de una fecha no es el de otra.
            onChange={(e) => onChange({ ...filtros, evento: e.target.value, tipo: TODOS })}
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

        <div className="flex gap-2">
          <select
            value={filtros.comprobante}
            onChange={(e) => set("comprobante", e.target.value as Filtros["comprobante"])}
            className="input-techno flex-1 md:w-auto"
            aria-label="Comprobante"
          >
            <option value={TODOS}>Comprobante</option>
            <option value="con">Con comprobante</option>
            <option value="sin">Sin comprobante</option>
          </select>
          <select
            value={filtros.origen}
            onChange={(e) => set("origen", e.target.value as Filtros["origen"])}
            className="input-techno flex-1 md:w-auto"
            aria-label="Origen"
          >
            <option value={TODOS}>Origen</option>
            <option value="web">De la web</option>
            <option value="manual">A mano</option>
          </select>
        </div>
      </div>

      {(tipos.length > 0 || hayFiltrosExtra(filtros)) && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Tipo de entrada">
          {tipos.length > 0 && (
            <>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tipo</span>
          <button type="button" onClick={() => set("tipo", TODOS)} className={chip(filtros.tipo === TODOS)}>
            Todas
          </button>
            </>
          )}
          {tipos.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => set("tipo", t.id)}
              className={chip(filtros.tipo === t.id)}
              aria-pressed={filtros.tipo === t.id}
            >
              {t.nombre} <span className="opacity-70">({t.ventas})</span>
            </button>
          ))}
          {hayFiltrosExtra(filtros) && (
            <button
              type="button"
              onClick={() => onChange({ ...FILTROS_INICIALES, evento: filtros.evento })}
              className="ml-auto inline-flex min-h-[36px] items-center gap-1 text-xs font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              <X className="h-3.5 w-3.5" /> Limpiar filtros
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default FiltrosEntregas;
