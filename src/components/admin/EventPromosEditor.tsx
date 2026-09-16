import { useEffect, useMemo, useState } from "react";
import { Tag } from "lucide-react";
import { TicketPromo, fetchTicketPromos, promoVigente } from "@/lib/ticketPromos";
import type { EventTicket } from "@/lib/ticketTypes";

/**
 * Qué promos aplica un evento, y sobre qué tipo de entrada (v21).
 *
 * Va dentro del form de evento, debajo de `TicketsEditor`, porque una promo sin
 * un tipo de entrada cargado no tiene dónde aplicarse: **sólo se ofrecen los
 * tipos que el evento ya está vendiendo**. Si primero se elige la promo y
 * después se saca el tipo, la fila queda apuntando a un tipo que el evento no
 * vende y no se aplicaría nunca — por eso el componente la descarta sola.
 */

export interface EventPromoSelection {
  promoId: string;
  ticketTypeId: string;
}

const EventPromosEditor = ({
  tickets,
  value,
  onChange,
}: {
  /** Tipos que el evento vende, tal como están en el form en este momento. */
  tickets: EventTicket[];
  value: EventPromoSelection[];
  onChange: (v: EventPromoSelection[]) => void;
}) => {
  const [catalogo, setCatalogo] = useState<TicketPromo[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    fetchTicketPromos().then((p) => {
      if (!vivo) return;
      setCatalogo(p);
      setCargando(false);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const tiposValidos = useMemo(() => new Set(tickets.map((t) => t.ticketTypeId)), [tickets]);

  /**
   * Si el evento deja de vender un tipo, sus promos sobre ese tipo se caen.
   *
   * Se hace en un efecto y no al guardar para que lo que se ve sea lo que se va
   * a guardar: una fila visible que después desaparece sin aviso es peor que no
   * mostrarla.
   */
  useEffect(() => {
    const limpio = value.filter((v) => tiposValidos.has(v.ticketTypeId));
    if (limpio.length !== value.length) onChange(limpio);
  }, [tiposValidos, value, onChange]);

  // Se ofrecen las promos activas; una desactivada sólo si el evento ya la
  // tenía cargada, para no borrársela sin avisar al editar un evento viejo.
  const yaUsadas = useMemo(() => new Set(value.map((v) => v.promoId)), [value]);
  const opciones = useMemo(
    () => catalogo.filter((p) => p.active || yaUsadas.has(p.id)),
    [catalogo, yaUsadas]
  );

  const tieneFila = (promoId: string, ticketTypeId: string) =>
    value.some((v) => v.promoId === promoId && v.ticketTypeId === ticketTypeId);

  const toggle = (promoId: string, ticketTypeId: string) => {
    if (tieneFila(promoId, ticketTypeId)) {
      onChange(value.filter((v) => !(v.promoId === promoId && v.ticketTypeId === ticketTypeId)));
    } else {
      onChange([...value, { promoId, ticketTypeId }]);
    }
  };

  if (cargando) {
    return <p className="text-xs text-muted-foreground">Cargando promos...</p>;
  }

  if (opciones.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No hay promos creadas. Se crean en la pestaña <b>Promos</b> y después se aplican acá.
      </p>
    );
  }

  if (tickets.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Primero elegí los tipos de entrada que vende el evento: una promo se aplica sobre uno
        de ellos.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {opciones.map((p) => {
        const vigente = promoVigente(p);
        return (
          <div key={p.id} className="border border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Tag className="h-3.5 w-3.5 flex-shrink-0 text-celeste-deep" />
              <span className="text-sm font-semibold">{p.name}</span>
              {!vigente && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] uppercase text-muted-foreground">
                  {p.active ? "fuera de fecha" : "desactivada"}
                </span>
              )}
            </div>
            {p.description && (
              <p className="mt-0.5 text-xs text-muted-foreground">{p.description}</p>
            )}
            {/* Un tilde por tipo de entrada: la misma promo puede ir sobre
                General y no sobre VIP. */}
            <div className="mt-2 flex flex-wrap gap-2">
              {tickets.map((t) => (
                <label
                  key={t.ticketTypeId}
                  className={`flex cursor-pointer items-center gap-2 border px-3 py-2 text-xs transition-colors ${
                    tieneFila(p.id, t.ticketTypeId)
                      ? "border-celeste bg-celeste/10 font-semibold"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="accent-celeste"
                    checked={tieneFila(p.id, t.ticketTypeId)}
                    onChange={() => toggle(p.id, t.ticketTypeId)}
                  />
                  {t.name}
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default EventPromosEditor;
