import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Clock, Ticket } from "lucide-react";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import { useAuth, formatEventDate, AdminEvent } from "@/contexts/AuthContext";
import {
  EventPromo,
  HORAS_CONTADOR,
  formatFinPromo,
  partesRestantes,
  promoVigente,
} from "@/lib/ticketPromos";
import { playThud } from "@/lib/spookySound";

// Diferido, igual que en EventCard y PromosSection: arrastra PhoneInput ->
// libphonenumber, y sólo hace falta si alguien toca "Comprar".
const CompraEntradas = lazy(() => import("./CompraEntradas"));

/**
 * "PROMOS ACTIVAS": las promos vigentes de todos los eventos, con su contador.
 *
 * Va entre el hero y los eventos porque es lo más urgente que tiene la página:
 * una promo que vence en 5 horas no puede estar debajo de un carrusel. **Si no
 * hay ninguna vigente, la sección no existe** — ni el título: un "no hay
 * promos" en el segundo bloque de la home se lee como un sitio abandonado.
 *
 * Una tarjeta es **una promo en un evento**, no una fila de la base: si el
 * mismo 2x1 está sobre General y VIP se muestra una sola tarjeta que dice "en
 * General y VIP". En la base son dos filas porque el cupo es por tipo.
 *
 * El contador sale sólo en las últimas `HORAS_CONTADOR` horas; antes dice
 * "Hasta el vie 12/10, 23:59". Cuando llega a cero la tarjeta desaparece sola,
 * y el modal de compra deja de aplicar el descuento (usa la misma
 * `promoVigente`).
 */

interface Oferta {
  key: string;
  event: AdminEvent;
  promo: EventPromo;
  /** Tipos de entrada sobre los que aplica, en el orden del evento. */
  tipos: Array<{ name: string; price: number; specialPrice?: number }>;
  /** El fin más próximo entre sus filas. Sin valor = sin fin. */
  endsAt?: string;
  /** Suma de lo que queda en todas sus filas; sin valor si alguna no tiene cupo. */
  remaining?: number;
}

const SEG = 1000;
const MIN = 60 * SEG;

/**
 * El reloj de la sección. Late cada segundo SÓLO si hay un contador a la
 * vista; si no, cada minuto, que alcanza para que una promo que arranca o
 * termina aparezca o se vaya sola. Un intervalo de 1 s que repinta la sección
 * sin nada que mostrar es trabajo del hilo principal tirado.
 */
const useAhora = (rapido: boolean) => {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    setAhora(Date.now());
    const id = window.setInterval(() => setAhora(Date.now()), rapido ? SEG : MIN);
    return () => window.clearInterval(id);
  }, [rapido]);
  return ahora;
};

const ofertasDe = (events: AdminEvent[], ahora: number): Oferta[] => {
  const out: Oferta[] = [];
  for (const event of events) {
    // Mismo criterio que la card del evento para "agotado".
    const ventaCerrada =
      event.status !== "activo" ||
      (event.saleEndsAt ? ahora >= Date.parse(event.saleEndsAt) : false);
    if (ventaCerrada) continue;

    const activos = event.tickets.filter((t) => t.active);
    const porPromo = new Map<string, EventPromo[]>();
    for (const p of event.promos) {
      // Sólo sobre tipos que el evento vende hoy: una promo sobre un tipo
      // pausado no se puede comprar.
      if (!promoVigente(p, ahora) || !activos.some((t) => t.ticketTypeId === p.ticketTypeId)) {
        continue;
      }
      porPromo.set(p.promoId, [...(porPromo.get(p.promoId) ?? []), p]);
    }

    for (const [promoId, filas] of porPromo) {
      const tipos = activos
        .filter((t) => filas.some((f) => f.ticketTypeId === t.ticketTypeId))
        .map((t) => ({
          name: t.name,
          price: t.price,
          specialPrice: filas.find((f) => f.ticketTypeId === t.ticketTypeId)?.specialPrice,
        }));
      const fines = filas.map((f) => f.endsAt).filter((x): x is string => !!x);
      const endsAt = fines.sort((a, b) => Date.parse(a) - Date.parse(b))[0];
      const remaining = filas.every((f) => f.remaining !== undefined)
        ? filas.reduce((acc, f) => acc + (f.remaining ?? 0), 0)
        : undefined;
      out.push({ key: `${event.id}:${promoId}`, event, promo: filas[0], tipos, endsAt, remaining });
    }
  }
  // Lo que vence antes, primero. Las que no vencen, al final y por fecha del evento.
  return out.sort((a, b) => {
    if (a.endsAt && b.endsAt) return Date.parse(a.endsAt) - Date.parse(b.endsAt);
    if (a.endsAt) return -1;
    if (b.endsAt) return 1;
    return a.event.date.localeCompare(b.event.date);
  });
};

/** "General", "General y VIP", "General, VIP y Backstage". */
const listar = (xs: string[]) =>
  xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;

const PromosActivasSection = () => {
  const { events } = useAuth();
  // Primera pasada con el reloj lento: con eso alcanza para saber si hace
  // falta el rápido.
  const [rapido, setRapido] = useState(false);
  const ahora = useAhora(rapido);
  const ofertas = useMemo(() => ofertasDe(events, ahora), [events, ahora]);

  const hayContador = ofertas.some(
    (o) => o.endsAt && Date.parse(o.endsAt) - ahora <= HORAS_CONTADOR * 60 * MIN
  );
  useEffect(() => setRapido(hayContador), [hayContador]);

  const [comprando, setComprando] = useState<AdminEvent | null>(null);

  if (ofertas.length === 0) return null;

  return (
    <section id="promos-activas" className="section-padding bg-papel" aria-labelledby="promos-activas-titulo">
      <div className="container-odisea">
        <div className="mb-6 text-center md:mb-10">
          <p className="eyebrow mb-3">Por tiempo limitado</p>
          <h2
            id="promos-activas-titulo"
            className="title-sport mb-4 text-5xl text-tinta sm:text-6xl md:text-7xl"
          >
            PROMOS <span className="highlight-celeste">ACTIVAS</span>
          </h2>
          <div className="mx-auto h-px w-16 bg-celeste" />
        </div>

        {/* Una sola oferta no se estira a todo el ancho: queda centrada. */}
        <div
          className={`grid gap-4 md:gap-5 ${
            ofertas.length === 1
              ? "mx-auto max-w-md grid-cols-1"
              : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
          }`}
        >
          {ofertas.map((o) => (
            <OfertaCard
              key={o.key}
              oferta={o}
              ahora={ahora}
              onComprar={() => {
                playThud();
                setComprando(o.event);
              }}
            />
          ))}
        </div>
      </div>

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
    </section>
  );
};

const OfertaCard = ({
  oferta,
  ahora,
  onComprar,
}: {
  oferta: Oferta;
  ahora: number;
  onComprar: () => void;
}) => {
  const { event, promo, tipos, endsAt, remaining } = oferta;
  const r = endsAt ? partesRestantes(endsAt, ahora) : null;
  const conContador = !!r && r.ms <= HORAS_CONTADOR * 60 * MIN;
  // En la última hora el contador se pone en rojo: es la única vez que la
  // urgencia es real, y si todo es urgente nada lo es.
  const ultimaHora = !!r && r.ms <= 60 * MIN;

  return (
    <article className="promo-activa-card card-techno flex flex-col p-5 md:p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {event.name} · {formatEventDate(event.date)}
      </p>

      <h3 className="mt-2 font-sport text-4xl font-black leading-[0.95] tracking-wide text-tinta md:text-5xl">
        {promo.name}
      </h3>

      {/*
        Sobre qué entrada aplica. En precio especial va el precio, que es la
        promo en sí: "General $500" con el de lista tachado dice todo sin
        explicar nada.
      */}
      {promo.kind === "precio_especial" ? (
        <ul className="mt-2 space-y-0.5 text-sm">
          {tipos.map((t) => (
            <li key={t.name}>
              {t.name}{" "}
              {t.specialPrice !== undefined && t.specialPrice < t.price ? (
                <>
                  <b className="text-tinta">${t.specialPrice}</b>{" "}
                  <span className="text-muted-foreground line-through">${t.price}</span>
                </>
              ) : (
                <b className="text-tinta">${t.price}</b>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          En {listar(tipos.map((t) => t.name))}
        </p>
      )}
      {promo.description && (
        <p className="mt-1 text-xs text-muted-foreground">{promo.description}</p>
      )}

      <div className="mt-4 flex-1">
        {conContador && r ? (
          // role="timer" sin aria-live: un lector de pantalla que anuncie cada
          // segundo es inusable. El aria-label da el dato de una vez.
          <div
            role="timer"
            aria-label={`Termina en ${r.dias} días, ${r.horas} horas y ${r.minutos} minutos`}
          >
            <p
              className={`mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] ${
                ultimaHora ? "text-charrua" : "text-celeste-deep"
              }`}
            >
              <Clock className="h-3.5 w-3.5" /> Termina en
            </p>
            <div className="grid grid-cols-4 gap-2" aria-hidden="true">
              {(
                [
                  [r.dias, "días"],
                  [r.horas, "hs"],
                  [r.minutos, "min"],
                  [r.segundos, "seg"],
                ] as const
              ).map(([n, rotulo]) => (
                <div
                  key={rotulo}
                  className={`border py-2 text-center ${
                    ultimaHora ? "border-charrua/50" : "border-border"
                  }`}
                >
                  <span className="block font-sport text-2xl font-black tabular-nums text-tinta md:text-3xl">
                    {String(n).padStart(2, "0")}
                  </span>
                  <span className="block text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                    {rotulo}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : endsAt ? (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="h-4 w-4 text-celeste-deep" /> Hasta el {formatFinPromo(endsAt)}
          </p>
        ) : null}

        {remaining !== undefined && (
          <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-tinta">
            <Ticket className="h-4 w-4 text-celeste-deep" />
            {remaining === 1 ? "Queda 1 entrada en promo" : `Quedan ${remaining} entradas en promo`}
          </p>
        )}
      </div>

      <button onClick={onComprar} className="btn-techno mt-5 w-full text-xs">
        <WhatsAppIcon className="h-4 w-4" />
        <span>Comprar</span>
      </button>
    </article>
  );
};

export default PromosActivasSection;
