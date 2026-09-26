import { useEffect, useMemo, useState } from "react";
import { Tag } from "lucide-react";
import {
  TicketPromo,
  EventPromo,
  EventPromoInput,
  PromoKind,
  fetchTicketPromos,
} from "@/lib/ticketPromos";
import type { EventTicket } from "@/lib/ticketTypes";

/**
 * Qué promos aplica un evento, sobre qué tipo de entrada, y —desde v24—
 * cuándo, con cuánto cupo y a qué precio especial.
 *
 * Va dentro del form de evento, debajo de `TicketsEditor`, porque una promo sin
 * un tipo de entrada cargado no tiene dónde aplicarse: **sólo se ofrecen los
 * tipos que el evento ya está vendiendo**. Si primero se elige la promo y
 * después se saca el tipo, la fila queda apuntando a un tipo que el evento no
 * vende y no se aplicaría nunca — por eso el componente la descarta sola.
 *
 * **Las fechas se cargan una vez por promo, no por tipo de entrada.** En la
 * base cada fila (promo × tipo) tiene su ventana, pero nadie piensa "el 2x1 de
 * la General vence el viernes y el de la VIP también": piensa "el 2x1 vence el
 * viernes". El cupo y el precio especial sí van por tipo, porque ahí cada tipo
 * es distinto ("50 Generales en 2x1", "la VIP a $900").
 */

export interface EventPromoSelection {
  promoId: string;
  ticketTypeId: string;
  /** Sólo para validar en pantalla; no se guarda (el tipo es del catálogo). */
  kind: PromoKind;
  /** Valor de `<input type="datetime-local">`, en hora local. "" = sin límite. */
  startsLocal: string;
  endsLocal: string;
  /** "" = sin cupo / sin precio. Texto para no pelear con el input vacío. */
  quota: string;
  specialPrice: string;
}

// ─── Conversión ─────────────────────────────────────────────────────────────
// Mismo criterio que el "cierre de venta" del evento (`saleEndsAt`): el input
// es hora local del navegador de quien carga, que es el staff, en Uruguay.

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO (con zona) → valor para `datetime-local` en hora local. */
const isoALocal = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** `datetime-local` → ISO UTC. Vacío → null. */
const localAIso = (v: string) => (v ? new Date(v).toISOString() : null);

/** La promo del evento, como la edita este form. */
export const seleccionDesdeEvento = (p: EventPromo): EventPromoSelection => ({
  promoId: p.promoId,
  ticketTypeId: p.ticketTypeId,
  kind: p.kind,
  startsLocal: isoALocal(p.startsAt),
  endsLocal: isoALocal(p.endsAt),
  quota: p.quota !== undefined ? String(p.quota) : "",
  specialPrice: p.specialPrice !== undefined ? String(p.specialPrice) : "",
});

/** Lo que se manda a `saveEventPromos`. */
export const seleccionAGuardar = (sel: EventPromoSelection[]): EventPromoInput[] =>
  sel.map((s) => ({
    promoId: s.promoId,
    ticketTypeId: s.ticketTypeId,
    startsAt: localAIso(s.startsLocal),
    endsAt: localAIso(s.endsLocal),
    quota: s.quota.trim() ? Number(s.quota) : null,
    specialPrice: s.kind === "precio_especial" && s.specialPrice.trim() ? Number(s.specialPrice) : null,
  }));

/**
 * Lo que impide guardar, en palabras. `null` = todo bien.
 *
 * Duplica a propósito lo que la base ya rechaza (ventana al revés, precio
 * especial sin precio, cupo en cero): acá se dice QUÉ promo y QUÉ tipo, y el
 * error de la base llega recién después de guardar el evento, con el evento
 * ya escrito y las promos a medias.
 */
export const problemasPromos = (
  sel: EventPromoSelection[],
  tickets: EventTicket[],
  nombres: Record<string, string>
): string | null => {
  for (const s of sel) {
    const promo = nombres[s.promoId] ?? "La promo";
    const tipo = tickets.find((t) => t.ticketTypeId === s.ticketTypeId)?.name ?? "la entrada";
    if (s.startsLocal && s.endsLocal && s.startsLocal >= s.endsLocal) {
      return `"${promo}": la fecha de inicio tiene que ser anterior a la de fin.`;
    }
    if (s.quota.trim() && !(Number(s.quota) > 0 && Number.isInteger(Number(s.quota)))) {
      return `"${promo}" en ${tipo}: el cupo tiene que ser un número entero mayor a 0, o vacío.`;
    }
    if (s.kind === "precio_especial") {
      const precio = Number(s.specialPrice);
      if (!s.specialPrice.trim() || !(precio >= 0)) {
        return `"${promo}" en ${tipo}: poné el precio especial.`;
      }
    }
  }
  return null;
};

const EventPromosEditor = ({
  tickets,
  value,
  onChange,
  onCatalogo,
}: {
  /** Tipos que el evento vende, tal como están en el form en este momento. */
  tickets: EventTicket[];
  value: EventPromoSelection[];
  onChange: (v: EventPromoSelection[]) => void;
  /** Avisa al form los nombres de las promos, para los mensajes de validación. */
  onCatalogo?: (nombres: Record<string, string>) => void;
}) => {
  const [catalogo, setCatalogo] = useState<TicketPromo[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    fetchTicketPromos().then((p) => {
      if (!vivo) return;
      setCatalogo(p);
      setCargando(false);
      onCatalogo?.(Object.fromEntries(p.map((x) => [x.id, x.name])));
    });
    return () => {
      vivo = false;
    };
    // onCatalogo se llama una vez, al llegar el catálogo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const fila = (promoId: string, ticketTypeId: string) =>
    value.find((v) => v.promoId === promoId && v.ticketTypeId === ticketTypeId);

  const toggle = (p: TicketPromo, ticketTypeId: string) => {
    if (fila(p.id, ticketTypeId)) {
      onChange(value.filter((v) => !(v.promoId === p.id && v.ticketTypeId === ticketTypeId)));
      return;
    }
    // Un tipo nuevo hereda las fechas de los que la promo ya tiene en este
    // evento: son "de la promo", no del tipo.
    const hermana = value.find((v) => v.promoId === p.id);
    onChange([
      ...value,
      {
        promoId: p.id,
        ticketTypeId,
        kind: p.kind,
        startsLocal: hermana?.startsLocal ?? "",
        endsLocal: hermana?.endsLocal ?? "",
        quota: "",
        specialPrice: "",
      },
    ]);
  };

  /** Cambia las fechas en TODAS las filas de la promo (ver el encabezado). */
  const setFechas = (promoId: string, patch: Partial<Pick<EventPromoSelection, "startsLocal" | "endsLocal">>) =>
    onChange(value.map((v) => (v.promoId === promoId ? { ...v, ...patch } : v)));

  const setFila = (
    promoId: string,
    ticketTypeId: string,
    patch: Partial<Pick<EventPromoSelection, "quota" | "specialPrice">>
  ) =>
    onChange(
      value.map((v) =>
        v.promoId === promoId && v.ticketTypeId === ticketTypeId ? { ...v, ...patch } : v
      )
    );

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

  const campo =
    "w-full border border-border bg-background px-2 py-1.5 text-base sm:text-sm focus:border-foreground focus:outline-none";

  return (
    <div className="space-y-2">
      {opciones.map((p) => {
        const filas = value.filter((v) => v.promoId === p.id);
        const primera = filas[0];
        return (
          <div key={p.id} className="border border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Tag className="h-3.5 w-3.5 flex-shrink-0 text-celeste-deep" />
              <span className="text-sm font-semibold">{p.name}</span>
              {p.kind === "precio_especial" && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] uppercase text-muted-foreground">
                  precio especial
                </span>
              )}
              {!p.active && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] uppercase text-muted-foreground">
                  desactivada
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
                    fila(p.id, t.ticketTypeId)
                      ? "border-celeste bg-celeste/10 font-semibold"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="accent-celeste"
                    checked={!!fila(p.id, t.ticketTypeId)}
                    onChange={() => toggle(p, t.ticketTypeId)}
                  />
                  {t.name}
                </label>
              ))}
            </div>

            {primera && (
              <div className="mt-3 space-y-3 border-t border-border pt-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="block text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                    Desde
                    <input
                      type="datetime-local"
                      value={primera.startsLocal}
                      onChange={(e) => setFechas(p.id, { startsLocal: e.target.value })}
                      className={`${campo} mt-1`}
                    />
                  </label>
                  <label className="block text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                    Hasta
                    <input
                      type="datetime-local"
                      value={primera.endsLocal}
                      onChange={(e) => setFechas(p.id, { endsLocal: e.target.value })}
                      className={`${campo} mt-1`}
                    />
                  </label>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Vacías = sin límite. Con fecha de fin, en la home aparece "Hasta el …" y en las
                  últimas 72 hs un contador.
                </p>

                {/* Cupo y precio van por tipo: cada tipo es distinto. */}
                {filas.map((f) => {
                  const ticket = tickets.find((t) => t.ticketTypeId === f.ticketTypeId);
                  const precioEsp = Number(f.specialPrice);
                  const noAhorra =
                    p.kind === "precio_especial" &&
                    f.specialPrice.trim() !== "" &&
                    ticket &&
                    precioEsp >= ticket.price;
                  return (
                    <div key={f.ticketTypeId} className="grid grid-cols-2 items-end gap-2">
                      <label className="block text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                        Cupo {ticket?.name}
                        <input
                          type="number"
                          min={1}
                          inputMode="numeric"
                          placeholder="Sin límite"
                          value={f.quota}
                          onChange={(e) => setFila(p.id, f.ticketTypeId, { quota: e.target.value })}
                          className={`${campo} mt-1`}
                        />
                      </label>
                      {p.kind === "precio_especial" ? (
                        <label className="block text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                          Precio {ticket?.name} *
                          <input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            placeholder={ticket ? `Lista $${ticket.price}` : ""}
                            value={f.specialPrice}
                            onChange={(e) =>
                              setFila(p.id, f.ticketTypeId, { specialPrice: e.target.value })
                            }
                            className={`${campo} mt-1`}
                          />
                        </label>
                      ) : (
                        <span />
                      )}
                      {noAhorra && (
                        <p className="col-span-2 text-[11px] font-semibold text-charrua">
                          El precio especial no es más barato que el de lista (${ticket?.price}): la
                          promo no va a descontar nada.
                        </p>
                      )}
                    </div>
                  );
                })}
                <p className="text-[11px] text-muted-foreground">
                  El cupo son entradas (las de regalo del 2x1 cuentan) y se descuenta al cargar la
                  venta en Entregas con esta promo.
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default EventPromosEditor;
