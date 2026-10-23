import { lazy, Suspense, useState } from "react";
import { ArrowRight, Gift } from "lucide-react";
import { formatEventDate, AdminEvent } from "@/contexts/AuthContext";
import { HORAS_CONTADOR, formatFinPromo, partesRestantes } from "@/lib/ticketPromos";
import { MIN, useOfertas } from "@/lib/ofertasActivas";
import { playThud } from "@/lib/spookySound";

// Diferido, igual que en la sección de promos activas: arrastra libphonenumber
// y sólo hace falta si alguien toca el destacado.
const CompraEntradas = lazy(() => import("./CompraEntradas"));

/**
 * La promo más urgente, en la primera pantalla: justo bajo el banner y sobre
 * los dos atajos.
 *
 * "PROMOS ACTIVAS" (más abajo) lista todas, pero queda debajo del pliegue; una
 * promo que vence en pocos días tiene que verse apenas se entra. Es **la que
 * vence antes** (el mismo orden de esa sección) y **sale de los mismos datos**:
 * no hay un texto aparte que mantener ni que se pueda quedar desactualizado. Sin
 * ninguna promo vigente no se renderiza nada, ni el hueco.
 *
 * Tocarlo abre directo la compra de ese evento (el mismo modal que "Comprar" en
 * la tarjeta de la promo): para quien viene de un anuncio, cada paso menos es
 * una venta más.
 */
const PromoDestacada = () => {
  const { ofertas, ahora } = useOfertas();
  const [comprando, setComprando] = useState<AdminEvent | null>(null);

  const oferta = ofertas[0];
  if (!oferta) return null;

  const { event, promo, endsAt } = oferta;
  const r = endsAt ? partesRestantes(endsAt, ahora) : null;
  const cuentaRegresiva = !!r && r.ms <= HORAS_CONTADOR * 60 * MIN;
  const ultimaHora = !!r && r.ms <= 60 * MIN;

  const cierre = !endsAt
    ? formatEventDate(event.date)
    : cuentaRegresiva && r
      ? `Termina en ${r.dias > 0 ? `${r.dias}d ` : ""}${String(r.horas).padStart(2, "0")}h ${String(r.minutos).padStart(2, "0")}m`
      : `Hasta el ${formatFinPromo(endsAt)}`;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          playThud();
          setComprando(event);
        }}
        className="mx-auto mb-3 flex min-h-[64px] w-full max-w-md items-center gap-3 rounded-2xl bg-celeste px-4 py-3 text-left text-accent-foreground shadow-lg transition-transform active:scale-[0.99]"
        aria-label={`${promo.name} en ${event.name}. ${cierre}. Comprar`}
      >
        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-black/15">
          <Gift className="h-6 w-6" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          {/* El evento va arriba, chico, y puede cortarse. El nombre de la promo
              puede ocupar dos líneas. Y el cierre —lo más importante: hasta
              cuándo— va entero en su propia línea: nunca se corta. */}
          <span className="block truncate text-[10px] font-bold uppercase tracking-[0.18em] opacity-80">
            {event.name}
          </span>
          <span className="line-clamp-2 block font-sport text-xl font-black uppercase leading-[1.05] tracking-wide">
            {promo.name}
          </span>
          <span className={`block text-xs font-bold ${ultimaHora ? "underline" : ""}`}>{cierre}</span>
        </span>
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-black/80 text-white">
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </button>

      {comprando && (
        <Suspense fallback={null}>
          <CompraEntradas
            isOpen
            onClose={() => setComprando(null)}
            eventId={comprando.id}
            eventName={comprando.name}
            eventDate={formatEventDate(comprando.date)}
            eventLocation={comprando.location}
            tickets={comprando.tickets.filter((t) => t.active)}
            promos={comprando.promos}
          />
        </Suspense>
      )}
    </>
  );
};

export default PromoDestacada;
