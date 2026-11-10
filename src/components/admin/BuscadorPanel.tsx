import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Send, User as UserIcon } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { formatEventDate, useAuth } from "@/contexts/AuthContext";
import { TicketDelivery, fetchDeliveries } from "@/lib/deliveries";
import type { AdminTab } from "@/lib/adminPermisos";
import { foldText } from "@/lib/utils";

/**
 * Buscador de todo el panel (lupa o Ctrl+K): una venta, un usuario o un evento
 * por nombre, mail, teléfono, documento o número de pedido, desde cualquier
 * pestaña. Elegir un resultado lleva a su pestaña con la búsqueda puesta.
 *
 * Sólo busca en lo que el rol puede ver (`tabs`). Las ventas se piden al abrir,
 * no al entrar al panel: la mayoría de las veces nadie abre el buscador.
 *
 * El filtrado es propio (`shouldFilter={false}`) y no el de cmdk: con miles de
 * ventas, dejar que cmdk dibuje todos los ítems para filtrarlos traba el
 * teclado. Acá se calculan los primeros resultados de cada grupo y se dibujan
 * sólo ésos.
 */

/** A dónde lleva un resultado. `n` cambia en cada salto, así se aplica aunque se repita. */
export interface IrA {
  tab: AdminTab;
  busqueda?: string;
  estado?: "por_confirmar" | "pending" | "sent";
  n: number;
}

const POR_GRUPO = 6;

const BuscadorPanel = ({
  abierto,
  onAbierto,
  tabs,
  onIr,
}: {
  abierto: boolean;
  onAbierto: (v: boolean) => void;
  tabs: AdminTab[];
  onIr: (destino: Omit<IrA, "n">) => void;
}) => {
  const { users, events } = useAuth();
  const [q, setQ] = useState("");
  const [ventas, setVentas] = useState<TicketDelivery[] | null>(null);
  const veVentas = tabs.includes("deliveries");
  const veUsuarios = tabs.includes("users");
  const veEventos = tabs.includes("events");

  // Ctrl+K / Cmd+K desde cualquier lado del panel.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onAbierto(!abierto);
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [abierto, onAbierto]);

  useEffect(() => {
    if (!abierto) return;
    setQ("");
    if (!veVentas) return;
    let vivo = true;
    fetchDeliveries()
      .then((d) => vivo && setVentas(d))
      .catch(() => vivo && setVentas([]));
    return () => {
      vivo = false;
    };
  }, [abierto, veVentas]);

  const termino = foldText(q.trim().toLowerCase());
  const digitos = q.replace(/\D/g, "");
  const coincide = (texto: string, telefono?: string) =>
    foldText(texto.toLowerCase()).includes(termino) ||
    (digitos.length >= 4 && (telefono ?? "").replace(/\D/g, "").includes(digitos));

  const nombreEvento = useMemo(() => new Map(events.map((e) => [e.id, e.name])), [events]);

  const r = useMemo(() => {
    if (termino.length < 2) return null;
    return {
      ventas: veVentas
        ? (ventas ?? [])
            .filter((d) =>
              coincide(`${d.firstName} ${d.lastName} ${d.email} ${d.documentId ?? ""} ${d.orderCode ?? ""}`, d.phone)
            )
            .slice(0, POR_GRUPO)
        : [],
      usuarios: veUsuarios
        ? users
            .filter((u) => coincide(`${u.firstName} ${u.lastName} ${u.email} ${u.documentId ?? ""}`, u.phone))
            .slice(0, POR_GRUPO)
        : [],
      eventos: veEventos
        ? events.filter((e) => coincide(`${e.name} ${e.location}`)).slice(0, POR_GRUPO)
        : [],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termino, digitos, ventas, users, events, veVentas, veUsuarios, veEventos]);

  const ir = (destino: Omit<IrA, "n">) => {
    onAbierto(false);
    onIr(destino);
  };

  const ESTADO: Record<string, string> = {
    por_confirmar: "Por confirmar",
    vencido: "Por confirmar",
    pending: "Por enviar",
    sent: "Enviada",
  };

  const lugares = [veVentas && "ventas", veUsuarios && "usuarios", veEventos && "eventos"].filter(Boolean).join(", ");

  return (
    <Dialog open={abierto} onOpenChange={onAbierto}>
      <DialogContent className="top-[10%] max-w-lg translate-y-0 overflow-hidden p-0 sm:top-[15%]">
        <DialogTitle className="sr-only">Buscar en el panel</DialogTitle>
        <Command
          shouldFilter={false}
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:min-h-11 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2"
        >
          <CommandInput
            value={q}
            onValueChange={setQ}
            placeholder={`Buscar ${lugares || "en el panel"}…`}
            // 16 px: por debajo Safari de iOS hace zoom al enfocar.
            className="text-base sm:text-sm"
          />
          <CommandList className="max-h-[60vh]">
            {!r ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                Escribí un nombre, mail, teléfono, documento o número de pedido.
              </p>
            ) : (
              <>
                <CommandEmpty>
                  {veVentas && ventas === null ? "Buscando…" : "No encontramos nada con eso."}
                </CommandEmpty>
                {r.ventas.length > 0 && (
                  <CommandGroup heading="Ventas">
                    {r.ventas.map((d) => (
                      <CommandItem
                        key={d.id}
                        value={`venta-${d.id}`}
                        onSelect={() =>
                          ir({
                            tab: "deliveries",
                            busqueda: d.orderCode ?? d.email,
                            estado: d.status === "vencido" ? "por_confirmar" : d.status,
                          })
                        }
                      >
                        <Send className="mr-3 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">
                            {d.firstName} {d.lastName}
                            {d.orderCode && <span className="ml-2 font-mono text-xs text-muted-foreground">#{d.orderCode}</span>}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {nombreEvento.get(d.eventId) ?? "Evento eliminado"} · {d.quantity} entr. · {ESTADO[d.status]}
                          </p>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {r.usuarios.length > 0 && (
                  <CommandGroup heading="Usuarios">
                    {r.usuarios.map((u) => (
                      <CommandItem key={u.id} value={`usuario-${u.id}`} onSelect={() => ir({ tab: "users", busqueda: u.email })}>
                        <UserIcon className="mr-3 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">
                            {u.firstName} {u.lastName}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {r.eventos.length > 0 && (
                  <CommandGroup heading="Eventos">
                    {r.eventos.map((e) => (
                      <CommandItem key={e.id} value={`evento-${e.id}`} onSelect={() => ir({ tab: "events", busqueda: e.name })}>
                        <CalendarDays className="mr-3 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{e.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {formatEventDate(e.date)} · {e.location}
                          </p>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
};

export default BuscadorPanel;
