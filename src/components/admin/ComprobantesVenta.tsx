import { useState } from "react";
import { AlertTriangle, Eye, FileText, Receipt, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import ModalAdmin from "@/components/admin/ModalAdmin";
import { CampoComprobante, ComprobanteValor, VerComprobanteModal } from "@/components/admin/Comprobante";
import { useConfirm } from "@/components/ConfirmDialog";
import { esPdf, removeComprobante } from "@/lib/comprobantes";
import {
  ComprobanteVenta,
  agregarComprobanteVenta,
  cambiarCuentaComprobante,
  quitarComprobanteVenta,
} from "@/lib/comprobantesVenta";
import type { TicketDelivery } from "@/lib/deliveries";
import type { PaymentAccount } from "@/lib/paymentAccounts";

/**
 * Los comprobantes de una venta (v45): verlos, decir a qué cuenta fue cada
 * uno, agregar otro y quitar.
 *
 * Existe por el que compra la fecha equivocada: pagó a la cuenta de Colonia y
 * la diferencia la manda después, a veces a la de Paysandú. Cada comprobante
 * dice a qué cuenta fue, y si no es la del evento de la venta se marca, así
 * se sabe qué plata hay que pasar entre cuentas.
 */
interface Props {
  venta: TicketDelivery;
  comprobantes: ComprobanteVenta[];
  /** Si falta v45 sólo se ve el comprobante único de siempre. */
  conTabla: boolean;
  cuentas: PaymentAccount[];
  /** La cuenta en la que cobra el evento de la venta. */
  cuentaEvento?: string;
  eventName: string;
  /** "Ya está cargado en…", o null. Avisa y deja seguir, como en Cargar ventas. */
  yaCargado: (hash: string) => string | null;
  onCambio: () => void | Promise<void>;
  onClose: () => void;
}

const fecha = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}` : "";
};

const ComprobantesVentaModal = ({
  venta,
  comprobantes,
  conTabla,
  cuentas,
  cuentaEvento,
  eventName,
  yaCargado,
  onCambio,
  onClose,
}: Props) => {
  const confirm = useConfirm();
  const [viendo, setViendo] = useState<string | null>(null);
  const [cuentaNueva, setCuentaNueva] = useState(cuentaEvento ?? "");
  const [ocupado, setOcupado] = useState(false);
  const nombreCuenta = (id?: string) => cuentas.find((c) => c.id === id)?.label ?? "Sin cuenta";
  // Las inactivas se ofrecen igual si ya están puestas en algún comprobante.
  const opciones = (actual?: string) => cuentas.filter((c) => c.active || c.id === actual);

  // Con un comprobante ya puesto y sin v45 no hay dónde guardar un segundo.
  const puedeAgregar = conTabla || comprobantes.length === 0;

  const agregar = async (v: ComprobanteValor | null) => {
    if (!v) return;
    const repetido = v.hash ? yaCargado(v.hash) : null;
    setOcupado(true);
    const r = await agregarComprobanteVenta(venta, v.path, v.hash, cuentaNueva || undefined);
    setOcupado(false);
    if (!r.ok) {
      void removeComprobante(v.path);
      toast.error(r.error ?? "No se pudo agregar el comprobante");
      return;
    }
    if (repetido) toast.warning(repetido, { duration: 12000 });
    else toast.success("Comprobante agregado");
    await onCambio();
  };

  const cambiarCuenta = async (c: ComprobanteVenta, accountId: string) => {
    const r = await cambiarCuentaComprobante(c.id, accountId || null);
    if (!r.ok) return toast.error(r.error ?? "No se pudo cambiar la cuenta");
    await onCambio();
  };

  const quitar = async (c: ComprobanteVenta, n: number) => {
    const ok = await confirm({
      title: "Quitar comprobante",
      description: `¿Quitar el comprobante ${n} de esta venta? Se borra el archivo y no se puede deshacer.`,
      confirmText: "Quitar",
      destructive: true,
    });
    if (!ok) return;
    const r = await quitarComprobanteVenta(venta, c);
    if (!r.ok) return toast.error(r.error ?? "No se pudo quitar");
    toast.success("Comprobante quitado");
    await onCambio();
  };

  return (
    <>
      <ModalAdmin
        titulo="Comprobantes"
        subtitulo={`${venta.firstName} ${venta.lastName}`.trim() + ` · ${eventName}`}
        onClose={onClose}
        pie={
          <button type="button" onClick={onClose} className="btn-techno-outline inline-flex items-center justify-center gap-2">
            <X className="h-4 w-4" /> Cerrar
          </button>
        }
      >
        <div className="space-y-4">
          {comprobantes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Esta venta todavía no tiene comprobante.</p>
          ) : (
            <ul className="space-y-2">
              {comprobantes.map((c, i) => {
                const otraCuenta = Boolean(c.accountId && cuentaEvento && c.accountId !== cuentaEvento);
                return (
                  <li key={c.id || c.path} className="border border-border p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center bg-secondary">
                        {esPdf(c.path) ? <FileText className="h-5 w-5" /> : <Receipt className="h-5 w-5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">
                          Comprobante {i + 1}
                          <span className="font-normal text-muted-foreground"> · {fecha(c.createdAt)}</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setViendo(c.path)}
                        className="flex h-11 w-11 items-center justify-center hover:bg-secondary"
                        aria-label={`Ver comprobante ${i + 1}`}
                        title="Ver"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void quitar(c, i + 1)}
                        className="flex h-11 w-11 items-center justify-center hover:bg-destructive hover:text-destructive-foreground"
                        aria-label={`Quitar comprobante ${i + 1}`}
                        title="Quitar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {conTabla && c.id ? (
                      <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="whitespace-nowrap">Transferido a</span>
                        <select
                          value={c.accountId ?? ""}
                          onChange={(e) => void cambiarCuenta(c, e.target.value)}
                          className="input-techno min-w-0 flex-1 py-1.5 text-sm"
                        >
                          <option value="">Sin cuenta</option>
                          {opciones(c.accountId).map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {otraCuenta && (
                      <p className="mt-2 flex items-start gap-1.5 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                        <span>
                          Fue a <b>{nombreCuenta(c.accountId)}</b>, pero este evento cobra en{" "}
                          <b>{nombreCuenta(cuentaEvento)}</b>. Esa plata hay que pasarla entre cuentas.
                        </span>
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {puedeAgregar ? (
            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-sm font-semibold">
                {comprobantes.length === 0 ? "Agregar comprobante" : "Agregar otro comprobante"}
              </p>
              <p className="-mt-2 text-xs text-muted-foreground">
                Por ejemplo, la diferencia de alguien que compró la fecha equivocada.
              </p>
              <label className="flex items-center gap-2 text-sm">
                <span className="whitespace-nowrap text-muted-foreground">Se transfirió a</span>
                <select
                  value={cuentaNueva}
                  onChange={(e) => setCuentaNueva(e.target.value)}
                  className="input-techno min-w-0 flex-1"
                  disabled={ocupado}
                >
                  {opciones(cuentaNueva).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                      {a.id === cuentaEvento ? " (este evento)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {/* key: después de agregar, el campo vuelve a quedar vacío. */}
              <CampoComprobante key={comprobantes.length} valor={null} onChange={(v) => void agregar(v)} />
            </div>
          ) : (
            <p className="border-t border-border pt-4 text-xs text-muted-foreground">
              Para agregar más de un comprobante falta correr la migración v45.
            </p>
          )}
        </div>
      </ModalAdmin>

      {viendo && (
        <VerComprobanteModal path={viendo} titulo={`${venta.firstName} ${venta.lastName}`.trim()} onClose={() => setViendo(null)} />
      )}
    </>
  );
};

export default ComprobantesVentaModal;
