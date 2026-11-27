import { lazy, Suspense, useState } from "react";
import { ArrowRight, Gift } from "lucide-react";
import { formatEventDate, AdminEvent } from "@/contexts/AuthContext";
import { HORAS_CONTADOR, formatFinPromo, partesRestantes } from "@/lib/ticketPromos";
import { MIN, Oferta, useOfertas } from "@/lib/ofertasActivas";
import { playThud } from "@/lib/spookySound";

// Diferido, igual que en la sección de promos activas: arrastra libphonenumber
// y sólo hace falta si alguien toca el destacado.
const CompraEntradas = lazy(() => import("./CompraEntradas"));

/**
 * Las promos vigentes, en la primera pantalla: justo bajo el banner y sobre los
 * dos atajos. Una tarjeta por promo, la que vence antes arriba, hasta `MAX`.
 *
 * "PROMOS ACTIVAS" (más abajo) lista todas, pero queda debajo del pliegue; una
 * promo que vence en pocos días tiene que verse apenas se entra. Van en **el
 * mismo orden de esa sección** y **salen de los mismos datos**:
 * no hay un texto aparte que mantener ni que se pueda quedar desactualizado. Sin
 * ninguna promo vigente no se renderiza nada, ni el hueco.
 *
 * Tocarlo abre directo la compra de ese evento (el mismo modal que "Comprar" en
 * la tarjeta de la promo): para quien viene de un anuncio, cada paso menos es
 * una venta más.
 */
/**
 * Cuántas se muestran arriba. Cada una mide ~100 px y empuja los atajos hacia
 * abajo: con tres, los botones de "Ver eventos" todavía entran en el primer
 * pantallazo de un celular; con más, el banner pierde protagonismo. Las demás
 * quedan en "Promos activas", más abajo.
 */
const MAX = 3;

const TarjetaDestacada = ({
  oferta,
  ahora,
  onComprar,
}: {
  oferta: Oferta;
  ahora: number;
  onComprar: () => void;
}) => {
  const { event, promo, endsAt } = oferta;
  const r = endsAt ? partesRestantes(endsAt, ahora) : null;
  const cuentaRegresiva = !!r && r.ms <= HORAS_CONTADOR * 60 * MIN;
  const ultimaHora = !!r && r.ms <= 60 * MIN;

  const cierre = !endsAt
    ? formatEventDate(event.date)
    : cuentaRegresiva && r
      ? `Termina en ${r.dias > 0 ? `${r.dias}d ` : ""}${String(r.horas).padStart(2, "0")}h ${String(r.minutos).padStart(2, "0")}m`
      : `Hasta el ${formatFinPromo(endsAt)}`;

  // Más grande que una pastilla a propósito: es EL llamado a la acción de la
  // primera pantalla mientras dura la promo. Con el texto chico y una flechita
  // se leía como un aviso, no como un botón de compra. Por eso lleva la palabra
  // "Comprar" en un botón negro bien visible y el nombre de la promo en grande.
  return (
    <button
      type="button"
      onClick={onComprar}
      className="group mx-auto mb-3 flex min-h-[88px] w-full max-w-xl items-center gap-3 rounded-2xl bg-celeste px-4 py-3.5 text-left text-accent-foreground shadow-[0_10px_30px_-8px_hsl(var(--celeste)/0.7)] ring-2 ring-white/25 transition-transform hover:scale-[1.015] active:scale-[0.99] sm:gap-4 sm:px-5 sm:py-4"
      aria-label={`${promo.name} en ${event.name}. ${cierre}. Comprar`}
    >
      <span className="hidden h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-black/15 sm:flex">
        <Gift className="h-6 w-6" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        {/* El evento va arriba, chico, y puede cortarse. El nombre de la promo
            puede ocupar dos líneas. Y el cierre —lo más importante: hasta
            cuándo— va entero en su propia línea: nunca se corta. */}
        <span className="block truncate text-[11px] font-bold uppercase tracking-[0.18em] opacity-80 sm:text-xs">
          {event.name}
        </span>
        <span className="line-clamp-2 font-sport text-2xl font-black uppercase leading-[1] tracking-wide sm:text-4xl">
          {promo.name}
        </span>
        <span className={`mt-0.5 block text-xs font-bold sm:text-sm ${ultimaHora ? "underline" : ""}`}>{cierre}</span>
      </span>
      <span className="flex h-12 flex-shrink-0 items-center justify-center gap-1.5 rounded-full bg-black px-3.5 text-[13px] font-black uppercase tracking-wide text-white shadow-md sm:h-14 sm:px-6 sm:text-base">
        Comprar
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 sm:h-5 sm:w-5" aria-hidden="true" />
      </span>
    </button>
  );
};

const PromoDestacada = () => {
  const { ofertas, ahora } = useOfertas();
  const [comprando, setComprando] = useState<AdminEvent | null>(null);

  if (ofertas.length === 0) return null;

  return (
    <>
      {ofertas.slice(0, MAX).map((o) => (
        <TarjetaDestacada
          key={o.key}
          oferta={o}
          ahora={ahora}
          onComprar={() => {
            playThud();
            setComprando(o.event);
          }}
        />
      ))}

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
