import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import ModalAdmin from "@/components/admin/ModalAdmin";
import { useConfirm } from "@/components/ConfirmDialog";
import type { AdminEvent } from "@/contexts/AuthContext";
import { fmtPrecio, simbolo } from "@/lib/moneda";
import type { TicketType } from "@/lib/ticketTypes";
import { loteAgotado } from "@/lib/ticketTypes";
import {
  FilaTanda,
  aplicarCambioTanda,
  nombreDeLaSiguienteTanda,
  precioConAumento,
} from "@/lib/cambioTanda";

/**
 * "Cambiar de tanda": saca de la venta el lote actual de un evento y abre el
 * siguiente con otro precio. Sirve para cualquier evento, actual o futuro.
 *
 * Los nombres y precios nuevos se proponen solos ("1er lote" → "2do lote", +20%)
 * y se pueden pisar fila por fila antes de confirmar. El lote viejo no se borra.
 */
const CambioTandaModal = ({
  evento,
  catalogo,
  onClose,
  onHecho,
}: {
  evento: AdminEvent;
  catalogo: TicketType[];
  onClose: () => void;
  /** Se llama con el cambio ya guardado, para recargar los eventos. */
  onHecho: () => void | Promise<void>;
}) => {
  const confirm = useConfirm();
  const [porcentaje, setPorcentaje] = useState("20");
  const [pasarPromos, setPasarPromos] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const pct = Number.isFinite(Number(porcentaje)) ? Number(porcentaje) : 0;

  const armarFilas = (p: number): FilaTanda[] =>
    evento.tickets
      .filter((t) => t.active)
      .map((t) => ({
        ticketTypeId: t.ticketTypeId,
        description: t.description,
        isAbono: t.isAbono,
        sortOrder: t.sortOrder,
        nombreActual: t.name,
        precioActual: t.price,
        // Un lote ya agotado igual se puede pasar: es justo cuando se cambia de tanda.
        incluir: true,
        nombreNuevo: nombreDeLaSiguienteTanda(t.name),
        precioNuevo: precioConAumento(t.price, p, evento.currency),
        cupoNuevo: null,
      }));

  const [filas, setFilas] = useState<FilaTanda[]>(() => armarFilas(20));

  const setFila = (id: string, cambio: Partial<FilaTanda>) =>
    setFilas((prev) => prev.map((f) => (f.ticketTypeId === id ? { ...f, ...cambio } : f)));

  // Cambiar el porcentaje recalcula todos los precios (pisa lo que se hubiera tipeado).
  const aplicarPorcentaje = (valor: string) => {
    setPorcentaje(valor);
    const p = Number.isFinite(Number(valor)) ? Number(valor) : 0;
    setFilas((prev) =>
      prev.map((f) => ({ ...f, precioNuevo: precioConAumento(f.precioActual, p, evento.currency) }))
    );
  };

  const incluidasIds = new Set(filas.filter((f) => f.incluir).map((f) => f.ticketTypeId));
  const promosAfectadas = useMemo(
    () => evento.promos.filter((p) => incluidasIds.has(p.ticketTypeId)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [evento.promos, filas]
  );

  const confirmar = async () => {
    const incluidas = filas.filter((f) => f.incluir);
    const resumen = incluidas
      .map(
        (f) =>
          `${f.nombreActual} ${fmtPrecio(f.precioActual, evento.currency)} → ${f.nombreNuevo} ${fmtPrecio(f.precioNuevo, evento.currency)}`
      )
      .join("\n");
    const ok = await confirm({
      title: "¿Cambiar de tanda ahora?",
      description: `El cambio se ve en la web al instante.\n\n${resumen}`,
      confirmText: "Cambiar de tanda",
    });
    if (!ok) return;

    setGuardando(true);
    try {
      const r = await aplicarCambioTanda({ evento, filas, catalogo, pasarPromos });
      if (!r.ok) {
        toast.error(r.error ?? "No se pudo cambiar de tanda.");
        // Puede haber quedado a medias (entradas cambiadas, promos no): recargar igual.
        await onHecho();
        return;
      }
      await onHecho();
      toast.success(
        r.promosOmitidas > 0
          ? `Tanda cambiada. ${r.promosOmitidas} promo(s) de precio especial no se copiaron: revisalas en "Editar".`
          : "Tanda cambiada."
      );
      onClose();
    } finally {
      setGuardando(false);
    }
  };

  const hayFilas = filas.length > 0;

  return (
    <ModalAdmin
      titulo="Cambiar de tanda"
      subtitulo={evento.name}
      onClose={onClose}
      ancho="2xl"
      pie={
        <>
          <button type="button" onClick={onClose} className="btn-techno-outline min-h-[44px] px-5 text-xs">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void confirmar()}
            disabled={guardando || !hayFilas || incluidasIds.size === 0}
            className="btn-celeste inline-flex min-h-[44px] items-center gap-2 px-5 text-xs disabled:opacity-50"
          >
            {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
            Cambiar de tanda
          </button>
        </>
      }
    >
      {!hayFilas ? (
        <p className="text-sm text-muted-foreground">
          Este evento no tiene entradas a la venta. Cargalas primero desde "Editar".
        </p>
      ) : (
        <div className="space-y-4">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Se saca de la venta el lote actual y se abre el nuevo. El lote anterior <strong>no se borra</strong>:
            las ventas ya hechas quedan como están y en Entregas se ve en qué tanda compró cada uno.
          </p>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label-techno" htmlFor="tanda-pct">
                Subir el precio un
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="tanda-pct"
                  type="number"
                  min={0}
                  max={500}
                  step={1}
                  value={porcentaje}
                  onChange={(e) => aplicarPorcentaje(e.target.value)}
                  className="input-techno w-24 text-right"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
            <p className="pb-2 text-[11px] text-muted-foreground">
              Se redondea a {evento.currency === "USD" ? "el dólar" : "los 10 pesos"}. Podés ajustar cada
              precio abajo.
            </p>
          </div>

          <div className="space-y-3">
            {filas.map((f) => (
              <div
                key={f.ticketTypeId}
                className={`border p-3 ${f.incluir ? "border-foreground" : "border-border opacity-60"}`}
              >
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={f.incluir}
                    onChange={(e) => setFila(f.ticketTypeId, { incluir: e.target.checked })}
                    className="accent-foreground"
                  />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-medium">{f.nombreActual}</span>{" "}
                    <span className="text-muted-foreground">
                      · hoy {fmtPrecio(f.precioActual, evento.currency)}
                    </span>
                    {evento.tickets.find((t) => t.ticketTypeId === f.ticketTypeId && loteAgotado(t)) && (
                      <span className="ml-2 text-[10px] font-bold uppercase text-charrua">agotado</span>
                    )}
                  </span>
                </label>

                {f.incluir && (
                  <div className="ml-7 mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                    <div>
                      <label className="label-techno" htmlFor={`tn-${f.ticketTypeId}`}>
                        Nombre del lote nuevo
                      </label>
                      <input
                        id={`tn-${f.ticketTypeId}`}
                        type="text"
                        maxLength={60}
                        value={f.nombreNuevo}
                        onChange={(e) => setFila(f.ticketTypeId, { nombreNuevo: e.target.value })}
                        className="input-techno w-full"
                      />
                    </div>
                    <div>
                      <label className="label-techno" htmlFor={`tp-${f.ticketTypeId}`}>
                        Precio
                      </label>
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-muted-foreground">{simbolo(evento.currency)}</span>
                        <input
                          id={`tp-${f.ticketTypeId}`}
                          type="number"
                          min={0}
                          value={f.precioNuevo || ""}
                          onChange={(e) => setFila(f.ticketTypeId, { precioNuevo: Number(e.target.value) })}
                          className="input-techno w-24 text-right"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="label-techno" htmlFor={`tc-${f.ticketTypeId}`}>
                        Cupo (opc.)
                      </label>
                      <input
                        id={`tc-${f.ticketTypeId}`}
                        type="number"
                        min={0}
                        value={f.cupoNuevo ?? ""}
                        onChange={(e) =>
                          setFila(f.ticketTypeId, {
                            cupoNuevo: e.target.value === "" ? null : Math.max(0, Math.floor(Number(e.target.value))),
                          })
                        }
                        placeholder="—"
                        className="input-techno w-20 text-right"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {promosAfectadas > 0 && (
            <label className="flex cursor-pointer items-start gap-2 text-xs leading-relaxed">
              <input
                type="checkbox"
                checked={pasarPromos}
                onChange={(e) => setPasarPromos(e.target.checked)}
                className="mt-0.5 accent-foreground"
              />
              <span>
                Pasar las promos de descuento al lote nuevo ({promosAfectadas} cargada
                {promosAfectadas === 1 ? "" : "s"} sobre estas entradas). Las de "precio especial" no se
                copian: tienen un precio fijo del lote anterior. Si no las pasás, quedan solo en el lote viejo y
                dejan de aplicarse.
              </span>
            </label>
          )}
        </div>
      )}
    </ModalAdmin>
  );
};

export default CambioTandaModal;
