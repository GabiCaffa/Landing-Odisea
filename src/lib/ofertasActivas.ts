import { useEffect, useMemo, useState } from "react";
import { useAuth, AdminEvent } from "@/contexts/AuthContext";
import { EventPromo, HORAS_CONTADOR, promoVigente } from "@/lib/ticketPromos";

/**
 * Las ofertas vigentes de la home: una por promo y por evento.
 *
 * Vive acá, y no dentro de `PromosActivasSection`, porque lo usan DOS pantallas:
 * la sección "Promos activas" (todas, con su contador) y el destacado de la
 * primera pantalla (`PromoDestacada`, sólo la más urgente). Una sola cuenta,
 * para que nunca digan cosas distintas.
 */

export interface Oferta {
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

export const SEG = 1000;
export const MIN = 60 * SEG;

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

export const ofertasDe = (events: AdminEvent[], ahora: number): Oferta[] => {
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

/**
 * Las ofertas con el reloj ya resuelto: late cada segundo SÓLO si alguna está en
 * sus últimas horas (hay un contador a la vista) y cada minuto si no.
 */
export const useOfertas = () => {
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

  return { ofertas, ahora };
};
