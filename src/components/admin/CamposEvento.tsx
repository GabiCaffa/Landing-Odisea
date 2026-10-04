import { useMemo } from "react";
import { EventTicket, TicketType, sortEventTickets } from "@/lib/ticketTypes";

/**
 * Piezas del formulario de evento que usan DOS pantallas: el formulario de un
 * evento suelto y el de una fiesta de varios días.
 *
 * **Viven acá y no en `Admin.tsx` por una razón concreta**: si
 * `FiestaFormModal` las importara de ahí quedaría un import circular
 * —`Admin` importa el modal, el modal importa `Admin`—. Hoy Rollup lo
 * resuelve, pero depende de que nadie use estos valores durante la evaluación
 * del módulo, y eso es una promesa que nadie puede sostener a futuro.
 */

export const FormField = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="block text-xs tracking-[0.2em] uppercase text-muted-foreground mb-2">
      {label}
    </span>
    {children}
  </label>
);

/**
 * Elegir qué tipos vende el evento y a qué precio. El precio vive acá y no en
 * el catálogo porque el mismo "VIP" vale distinto en cada fecha.
 */
export const TicketsEditor = ({
  catalog,
  value,
  onChange,
}: {
  catalog: TicketType[];
  value: EventTicket[];
  onChange: (tickets: EventTicket[]) => void;
}) => {
  const selected = useMemo(
    () => new Map(value.map((t) => [t.ticketTypeId, t])),
    [value]
  );

  // Se ofrecen los tipos activos; los inactivos sólo si el evento ya los vendía
  // (si no, al editar un evento viejo se le borraría una entrada sin avisar).
  const options = useMemo(
    () => catalog.filter((t) => t.active || selected.has(t.id)),
    [catalog, selected]
  );

  const toggle = (type: TicketType) => {
    if (selected.has(type.id)) {
      onChange(value.filter((t) => t.ticketTypeId !== type.id));
      return;
    }
    onChange(
      sortEventTickets([
        ...value,
        {
          ticketTypeId: type.id,
          name: type.name,
          description: type.description,
          price: 0,
          active: true,
          sortOrder: type.sortOrder,
        },
      ])
    );
  };

  const setPrice = (typeId: string, price: number) =>
    onChange(value.map((t) => (t.ticketTypeId === typeId ? { ...t, price } : t)));

  const setActive = (typeId: string, active: boolean) =>
    onChange(value.map((t) => (t.ticketTypeId === typeId ? { ...t, active } : t)));

  if (options.length === 0) {
    return (
      <p className="text-xs text-muted-foreground border border-dashed border-border p-4">
        No hay tipos de entrada cargados. Creá al menos uno en la pestaña{" "}
        <strong>Entradas</strong>.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {options.map((type) => {
        const row = selected.get(type.id);
        return (
          <div
            key={type.id}
            className={`border p-3 ${row ? "border-foreground" : "border-border"}`}
          >
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={!!row}
                onChange={() => toggle(type)}
                className="accent-foreground flex-shrink-0"
                aria-label={`Vender ${type.name}`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {type.name}
                  {!type.active && (
                    <span className="ml-2 text-[10px] tracking-wider uppercase text-muted-foreground">
                      (tipo inactivo)
                    </span>
                  )}
                </p>
                {type.description && (
                  <p className="text-[11px] text-muted-foreground line-clamp-1">
                    {type.description}
                  </p>
                )}
              </div>
              {row && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-sm text-muted-foreground">$</span>
                  <input
                    type="number"
                    min={0}
                    value={row.price || ""}
                    onChange={(e) => setPrice(type.id, Number(e.target.value))}
                    className="input-techno w-24 text-right"
                    placeholder="0"
                    aria-label={`Precio de ${type.name}`}
                  />
                </div>
              )}
            </div>

            {row && (
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground mt-2 ml-7 cursor-pointer">
                <input
                  type="checkbox"
                  checked={row.active}
                  onChange={(e) => setActive(type.id, e.target.checked)}
                  className="accent-foreground"
                />
                A la venta (destildá para ocultarla sin perder el precio)
              </label>
            )}
          </div>
        );
      })}
      <p className="text-[11px] text-muted-foreground">
        El evento no tiene precio propio: el comprador elige cuántas de cada tipo y el
        total se calcula solo.
      </p>
    </div>
  );
};

// ─── Sugerencias que se aceptan con Tab ─────────────────────────────────────

/**
 * Hace que un campo vacío acepte con **Tab** lo que muestra su placeholder.
 *
 * Varios campos del panel proponen un valor y lo muestran en gris —el nombre
 * de cada día de una fiesta, la dirección de la página—. Hasta ahora eso era
 * decorativo: había que retipearlo entero. Pedido del autor: que se complete
 * con Tab, como en una terminal.
 *
 * **Sólo secuestra Tab cuando hay algo que completar**, o sea con el campo
 * vacío y una sugerencia disponible. En cualquier otro caso Tab navega como
 * siempre, que es lo que espera quien usa el teclado para moverse por el
 * formulario. `Shift+Tab` nunca se toca: va hacia atrás y ahí completar no
 * tiene sentido.
 *
 * Después de aceptar, el foco **se queda en el campo**: lo normal es querer
 * ajustar lo que acaba de entrar. Un segundo Tab ya navega, porque el campo
 * dejó de estar vacío.
 */
export const useAceptarConTab = (
  value: string,
  sugerencia: string,
  onChange: (v: string) => void
) => {
  const hayQueCompletar = !value.trim() && !!sugerencia.trim();

  return (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Tab" || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
    if (!hayQueCompletar) return;
    e.preventDefault();
    onChange(sugerencia);
  };
};

/** El aviso de que se puede completar con Tab. Se muestra sólo cuando aplica:
 *  una pista permanente al lado de un campo ya lleno es ruido. */
export const PistaTab = ({ visible }: { visible: boolean }) =>
  visible ? (
    <p className="mt-1 text-[11px] text-muted-foreground">
      Apretá <kbd className="rounded border border-border px-1 font-sans">Tab</kbd> para
      completar con lo que dice en gris.
    </p>
  ) : null;
