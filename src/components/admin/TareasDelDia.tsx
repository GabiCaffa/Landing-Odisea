import { ReactNode } from "react";
import { ArrowRight, Cake, CheckCircle2, Clock, Send, TrendingUp } from "lucide-react";
import type { Pendientes } from "@/lib/pendientesPanel";
import type { IrA } from "@/components/admin/BuscadorPanel";

/**
 * Lo primero que se ve al entrar: lo que hay que hacer hoy, con un toque para
 * ir derecho a eso. Antes el inicio eran cuatro números de catálogo (usuarios,
 * capacidad, precio promedio) que no piden ninguna acción.
 *
 * Una tarjeta en cero se muestra apagada y no desaparece: que diga "0 pagos
 * por confirmar" también es información ("está todo al día").
 */
const plata = (n: number) => `$${Math.round(n).toLocaleString("es-UY")}`;

const Tarjeta = ({
  icono,
  n,
  titulo,
  bajada,
  urgente,
  onClick,
}: {
  icono: ReactNode;
  n: number;
  titulo: string;
  bajada: string;
  urgente?: boolean;
  onClick: () => void;
}) => {
  const activa = n > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex min-h-[112px] w-full flex-col justify-between rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] ${
        activa
          ? urgente
            ? "border-celeste/50 bg-celeste/10"
            : "border-border bg-card"
          : "border-border bg-card opacity-70"
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-lg ${
            activa && urgente ? "bg-celeste text-white" : "bg-secondary text-muted-foreground"
          }`}
        >
          {icono}
        </span>
        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
      <div className="mt-3">
        <p className="text-3xl font-black leading-none tabular-nums text-tinta">{n}</p>
        <p className="mt-1 text-sm font-semibold">{titulo}</p>
        <p className="text-xs text-muted-foreground">{bajada}</p>
      </div>
    </button>
  );
};

const TareasDelDia = ({
  pendientes,
  onIr,
}: {
  pendientes: Pendientes;
  onIr: (destino: Omit<IrA, "n">) => void;
}) => {
  const { porConfirmar, porEnviar, cumplesARevisar, semana } = pendientes;
  const hayTareas = [porConfirmar, porEnviar, cumplesARevisar].some((n) => n !== null);
  if (!hayTareas && !semana) return null;
  const todoAlDia = !porConfirmar && !porEnviar && !cumplesARevisar;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-muted-foreground">Para hacer hoy</h2>
        {todoAlDia && (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-600">
            <CheckCircle2 className="h-4 w-4" /> Todo al día
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {porConfirmar !== null && (
          <Tarjeta
            icono={<Clock className="h-[18px] w-[18px]" />}
            n={porConfirmar}
            titulo="Pagos por confirmar"
            bajada="Pedidos de la web sin ver el comprobante"
            urgente
            onClick={() => onIr({ tab: "deliveries", estado: "por_confirmar" })}
          />
        )}
        {porEnviar !== null && (
          <Tarjeta
            icono={<Send className="h-[18px] w-[18px]" />}
            n={porEnviar}
            titulo="Entradas por enviar"
            bajada="Pagaron y esperan sus entradas"
            urgente
            onClick={() => onIr({ tab: "deliveries", estado: "pending" })}
          />
        )}
        {cumplesARevisar !== null && (
          <Tarjeta
            icono={<Cake className="h-[18px] w-[18px]" />}
            n={cumplesARevisar}
            titulo="Cumpleaños a revisar"
            bajada="Solicitudes nuevas desde la web"
            urgente
            onClick={() => onIr({ tab: "birthdays" })}
          />
        )}
        {semana && (
          <div className="flex min-h-[112px] flex-col justify-between rounded-xl border border-border bg-card p-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
              <TrendingUp className="h-[18px] w-[18px]" />
            </span>
            <div className="mt-3">
              <p className="text-2xl font-black leading-none tabular-nums text-tinta">{plata(semana.plata)}</p>
              <p className="mt-1 text-sm font-semibold">Últimos 7 días</p>
              <p className="text-xs text-muted-foreground">
                {semana.ventas} ventas · {semana.entradas} entradas
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default TareasDelDia;
