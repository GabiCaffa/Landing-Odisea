import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ListOrdered, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useConfirm } from "@/components/ConfirmDialog";
import { agruparEventos, compararParaHome } from "@/lib/grupos";
import { guardarOrdenHome, restablecerOrdenHome, faltaMigracionOrden } from "@/lib/ordenEventos";

/**
 * El orden de las tarjetas de la home, elegido a mano (v32).
 *
 * Muestra la grilla **tal cual se ve en la home**, con una flecha para subir o
 * bajar cada tarjeta. Es la misma lista que arma la home (`agruparEventos` +
 * `compararParaHome`): lo que se ve acá es lo que se ve allá.
 *
 * - **Una fiesta de varios días es UNA fila**, como en la home.
 * - **Los agotados van siempre al final** de la home, así que no se pueden subir
 *   por encima de los que están a la venta: la flecha ni se ofrece.
 * - Un evento recién creado no tiene lugar y aparece al final hasta que se lo suba.
 * - Mover una tarjeta numera todas (0, 1, 2…), así el orden queda fijo y no depende
 *   de la fecha. "Volver al orden por fecha" borra los números.
 */
const OrdenHomeEventos = () => {
  const { events, refreshEvents } = useAuth();
  const confirm = useConfirm();
  const [guardando, setGuardando] = useState(false);

  const filas = useMemo(
    () =>
      agruparEventos(events.filter((e) => e.status !== "finalizado")).sort(compararParaHome),
    [events]
  );
  // ¿Alguien eligió un orden alguna vez? Si no, todo va por fecha.
  const hayOrdenElegido = filas.some((f) => f.orden !== undefined);

  const guardar = async (accion: () => Promise<void>, ok: string) => {
    setGuardando(true);
    try {
      await accion();
      await refreshEvents();
      toast.success(ok);
    } catch (err) {
      toast.error(
        faltaMigracionOrden(err)
          ? "Falta correr la migración v32_orden_eventos_home.sql en Supabase."
          : "No se pudo guardar el orden. ¿Seguís con la sesión iniciada?"
      );
    } finally {
      setGuardando(false);
    }
  };

  const mover = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= filas.length || filas[i].agotado !== filas[j].agotado) return;
    const nuevo = [...filas];
    [nuevo[i], nuevo[j]] = [nuevo[j], nuevo[i]];
    void guardar(
      () => guardarOrdenHome(nuevo.map((f) => f.dias.map((d) => d.id))),
      "Orden guardado"
    );
  };

  const restablecer = async () => {
    const ok = await confirm({
      title: "Volver al orden por fecha",
      description:
        "Se borra el orden que elegiste y la home vuelve a mostrar las fechas de la más cercana a la más lejana.",
      confirmText: "Volver al orden por fecha",
    });
    if (!ok) return;
    void guardar(
      () => restablecerOrdenHome(filas.flatMap((f) => f.dias.map((d) => d.id))),
      "La home vuelve al orden por fecha"
    );
  };

  if (filas.length < 2) return null;

  return (
    <details className="group border border-border bg-card">
      <summary className="flex min-h-[48px] cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold">
        <ListOrdered className="h-4 w-4" aria-hidden="true" />
        Orden en la home
        <span className="ml-auto text-xs font-normal text-muted-foreground">
          {hayOrdenElegido ? "orden elegido a mano" : "por fecha"}
        </span>
      </summary>

      <div className="border-t border-border p-4">
        <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
          Así se ve la grilla de <strong>Próximos eventos</strong>, de arriba hacia abajo. Usá
          las flechas para elegir cuál va primero. Los <strong>agotados siempre van al final</strong>,
          y un evento nuevo aparece al final hasta que lo subas.
        </p>

        <ol className="space-y-2">
          {filas.map((f, i) => {
            const puedeSubir = i > 0 && filas[i - 1].agotado === f.agotado;
            const puedeBajar = i < filas.length - 1 && filas[i + 1].agotado === f.agotado;
            return (
              <li
                key={f.key}
                className="flex items-center gap-3 border border-border p-2"
              >
                <span className="w-6 flex-shrink-0 text-center text-sm font-black text-muted-foreground">
                  {i + 1}
                </span>
                {f.destino.image && (
                  <img
                    src={f.destino.image}
                    alt=""
                    loading="lazy"
                    className="h-12 w-10 flex-shrink-0 rounded object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold leading-tight">{f.nombre}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {f.fecha}
                    {f.agotado && " · Agotado: va al final"}
                    {!f.agotado && f.orden === undefined && hayOrdenElegido && " · Sin lugar elegido"}
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => mover(i, -1)}
                    disabled={!puedeSubir || guardando}
                    aria-label={`Subir ${f.nombre}`}
                    className="flex h-11 w-11 items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-30"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => mover(i, 1)}
                    disabled={!puedeBajar || guardando}
                    aria-label={`Bajar ${f.nombre}`}
                    className="flex h-11 w-11 items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-30"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>

        {hayOrdenElegido && (
          <button
            type="button"
            onClick={() => void restablecer()}
            disabled={guardando}
            className="mt-3 inline-flex min-h-[44px] items-center gap-2 text-xs font-semibold text-muted-foreground underline hover:text-foreground disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Volver al orden por fecha
          </button>
        )}
      </div>
    </details>
  );
};

export default OrdenHomeEventos;
