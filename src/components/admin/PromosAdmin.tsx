import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Eye, EyeOff, Tag } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";
import {
  TicketPromo,
  TicketPromoInput,
  fetchTicketPromos,
  createTicketPromo,
  updateTicketPromo,
  deleteTicketPromo,
  promoVigente,
} from "@/lib/ticketPromos";
import { usePuede } from "@/lib/adminPermisos";

/**
 * Catálogo de promos de entrada (v21).
 *
 * Vive en su propio archivo y no dentro de `Admin.tsx` como el resto de las
 * pestañas: ese archivo ya pasa las 5000 líneas y seguir apilando ahí es cómo
 * llegó a ese tamaño. Lo nuevo empieza afuera.
 *
 * **Los dos números del mecanismo son internos.** Acá se configuran; el
 * comprador ve el `name` y el precio final. Por eso el form muestra en vivo un
 * ejemplo con números redondos: es la única forma de que quien carga la promo
 * entienda qué acaba de configurar sin tener que hacer la cuenta.
 */

const fmtFecha = (iso?: string) => {
  if (!iso) return null;
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};

/** Qué paga alguien que lleva `cant` entradas de `precio` con esta promo. */
const ejemplo = (
  everyN: number,
  discountedUnits: number,
  percentOff: number,
  precio = 1000,
  cant?: number
) => {
  const c = cant ?? everyN;
  const bruto = precio * c;
  const desc = Math.round(
    Math.floor(c / everyN) * Math.max(1, discountedUnits) * precio * (percentOff / 100)
  );
  return { c, bruto, desc, total: bruto - desc };
};

/**
 * Atajos para las promos que se usan de verdad.
 *
 * Existen porque los tres números son correctos pero no son la forma en que
 * alguien piensa una promo: uno piensa "2x1", no "cada 2, 1 al 100%". Con el
 * atajo se carga en un click y los números quedan visibles abajo por si hay que
 * inventar algo que no está en la lista.
 */
const ATAJOS: Array<{ label: string; everyN: number; discountedUnits: number; percentOff: number }> = [
  { label: "2x1", everyN: 2, discountedUnits: 1, percentOff: 100 },
  { label: "3x2", everyN: 3, discountedUnits: 1, percentOff: 100 },
  { label: "2da al 50%", everyN: 2, discountedUnits: 1, percentOff: 50 },
  { label: "3 al precio de 1", everyN: 3, discountedUnits: 2, percentOff: 100 },
];

const PromosAdmin = () => {
  const confirm = useConfirm();
  // Borrar una promo del catálogo la saca de todos los eventos que la usan:
  // sólo admin (ticket_promos_delete_admin, v22). Crear y editar sí puede el
  // operador, incluso desactivarla — que es el camino reversible.
  const puedeBorrar = usePuede("promos:borrar");
  const [promos, setPromos] = useState<TicketPromo[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TicketPromo | null>(null);
  const [showForm, setShowForm] = useState(false);

  const reload = async () => {
    setLoading(true);
    setPromos(await fetchTicketPromos());
    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, []);

  const handleSave = async (data: TicketPromoInput) => {
    const result = editing
      ? await updateTicketPromo(editing.id, data)
      : await createTicketPromo(data);
    if (!result.ok) {
      toast.error(result.error ?? "No se pudo guardar la promo");
      return;
    }
    toast.success(editing ? "Promo actualizada" : "Promo creada");
    setShowForm(false);
    setEditing(null);
    reload();
  };

  const handleToggle = async (p: TicketPromo) => {
    const result = await updateTicketPromo(p.id, { active: !p.active });
    if (!result.ok) return toast.error(result.error ?? "No se pudo cambiar el estado");
    // Desactivar acá la apaga en TODOS los eventos que la usan. Se avisa,
    // porque desde esta pantalla no se ve cuáles son.
    toast.success(p.active ? "Promo desactivada en todos los eventos" : "Promo activada");
    reload();
  };

  const handleDelete = async (p: TicketPromo) => {
    const ok = await confirm({
      title: "Eliminar promo",
      description: `¿Eliminar "${p.name}"? Si algún evento la está usando no se va a poder borrar: en ese caso sacala de esos eventos o desactivala.`,
      confirmText: "Eliminar",
      destructive: true,
    });
    if (!ok) return;
    const result = await deleteTicketPromo(p.id);
    if (!result.ok) return toast.error(result.error ?? "No se pudo eliminar");
    toast.success("Promo eliminada");
    reload();
  };

  if (loading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Cargando promos...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Las promos se crean acá y se aplican a los eventos desde el form de cada evento.
        </p>
        <button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="btn-celeste flex-shrink-0 text-xs"
        >
          <Plus className="h-4 w-4" /> Nueva promo
        </button>
      </div>

      {promos.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Todavía no hay promos. Creá una con el botón de arriba.
        </p>
      ) : (
        <div className="space-y-2">
          {promos.map((p) => {
            const e = ejemplo(p.everyN, p.discountedUnits, p.percentOff);
            const vigente = promoVigente(p);
            return (
              <div
                key={p.id}
                className="flex flex-col gap-3 border border-border p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{p.name}</span>
                    {!p.active ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] uppercase text-muted-foreground">
                        desactivada
                      </span>
                    ) : !vigente ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] uppercase text-muted-foreground">
                        fuera de fecha
                      </span>
                    ) : (
                      <span className="rounded-full bg-celeste px-2 py-0.5 text-[11px] uppercase text-accent-foreground">
                        vigente
                      </span>
                    )}
                  </div>
                  {p.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{p.description}</p>
                  )}
                  {/* El mecanismo se muestra como un ejemplo con plata, no como
                      "cada 2, 1 al 50%": es lo que de verdad hay que entender. */}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {e.c} entradas de $1000 → <b className="text-foreground">${e.total}</b>{" "}
                    (−${e.desc})
                  </p>
                  {(p.startsAt || p.endsAt) && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {p.startsAt ? `Desde ${fmtFecha(p.startsAt)}` : "Sin fecha de inicio"}
                      {" · "}
                      {p.endsAt ? `hasta ${fmtFecha(p.endsAt)}` : "sin fecha de fin"}
                    </p>
                  )}
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <button
                    onClick={() => handleToggle(p)}
                    className="flex h-11 w-11 items-center justify-center transition-colors hover:bg-muted"
                    title={p.active ? "Desactivar" : "Activar"}
                    aria-label={p.active ? "Desactivar promo" : "Activar promo"}
                  >
                    {p.active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => {
                      setEditing(p);
                      setShowForm(true);
                    }}
                    className="flex h-11 w-11 items-center justify-center transition-colors hover:bg-muted"
                    title="Editar"
                    aria-label="Editar promo"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  {puedeBorrar && (
                    <button
                      onClick={() => handleDelete(p)}
                      className="flex h-11 w-11 items-center justify-center transition-colors hover:bg-destructive hover:text-destructive-foreground"
                      title="Eliminar"
                      aria-label="Eliminar promo"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <PromoFormModal
          editing={editing}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSave={handleSave}
        />
      )}
    </div>
  );
};

const PromoFormModal = ({
  editing,
  onClose,
  onSave,
}: {
  editing: TicketPromo | null;
  onClose: () => void;
  onSave: (data: TicketPromoInput) => void | Promise<void>;
}) => {
  const [form, setForm] = useState<TicketPromoInput>({
    name: editing?.name ?? "",
    description: editing?.description ?? "",
    everyN: editing?.everyN ?? 2,
    discountedUnits: editing?.discountedUnits ?? 1,
    percentOff: editing?.percentOff ?? 100,
    startsAt: editing?.startsAt ?? "",
    endsAt: editing?.endsAt ?? "",
    active: editing?.active ?? true,
  });
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof TicketPromoInput>(k: K, v: TicketPromoInput[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form.name.trim()) return toast.error("Poné un nombre (es lo que ve el cliente)");
    if (form.everyN < 2) return toast.error("El mínimo es cada 2 entradas");
    if (form.discountedUnits < 1) return toast.error("Se tiene que descontar al menos 1");
    if (form.discountedUnits >= form.everyN)
      return toast.error("Las que se descuentan tienen que ser menos que el total del grupo");
    if (form.percentOff < 1 || form.percentOff > 100)
      return toast.error("El descuento va entre 1% y 100%");
    if (form.startsAt && form.endsAt && form.startsAt > form.endsAt)
      return toast.error("La fecha de inicio es posterior a la de fin");
    setSaving(true);
    await onSave({ ...form, name: form.name.trim() });
    setSaving(false);
  };

  const e2 = ejemplo(form.everyN, form.discountedUnits, form.percentOff);
  const e4 = ejemplo(form.everyN, form.discountedUnits, form.percentOff, 1000, form.everyN * 2);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-0 backdrop-blur-sm sm:p-4">
      <form
        onSubmit={submit}
        className="relative flex h-full w-full flex-col bg-background sm:h-auto sm:max-h-[92vh] sm:max-w-lg sm:border sm:border-border"
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border p-4 md:p-6">
          <h2 className="title-sport text-lg font-black tracking-wide md:text-xl">
            {editing ? "Editar promo" : "Nueva promo"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 flex h-11 w-11 items-center justify-center hover:bg-muted"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4 md:p-6">
          <div>
            <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Nombre *
            </label>
            <input
              value={form.name}
              onChange={(ev) => set("name", ev.target.value)}
              placeholder="2x1"
              className="input-techno"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Es lo único que ve el cliente. Escribilo como se lo dirías a él.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Detalle (opcional)
            </label>
            <input
              value={form.description ?? ""}
              onChange={(ev) => set("description", ev.target.value)}
              placeholder="Válido sólo en preventa"
              className="input-techno"
            />
          </div>

          {/*
            Atajos primero. Casi siempre la promo que se quiere cargar es una de
            estas cuatro, y elegirla de un click evita tener que traducir "2x1" a
            tres números. Los números quedan visibles abajo igual, para el caso
            que no esté en la lista.
          */}
          <div>
            <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Atajos
            </label>
            <div className="flex flex-wrap gap-2">
              {ATAJOS.map((a) => {
                const igual =
                  form.everyN === a.everyN &&
                  form.discountedUnits === a.discountedUnits &&
                  form.percentOff === a.percentOff;
                return (
                  <button
                    key={a.label}
                    type="button"
                    onClick={() =>
                      setForm((p) => ({
                        ...p,
                        everyN: a.everyN,
                        discountedUnits: a.discountedUnits,
                        percentOff: a.percentOff,
                        // El nombre sólo se completa si está vacío: si el admin
                        // ya escribió el suyo, un atajo no se lo pisa.
                        name: p.name.trim() ? p.name : a.label,
                      }))
                    }
                    className={`border px-3 py-2 text-xs transition-colors ${
                      igual
                        ? "border-celeste bg-celeste/10 font-semibold"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {a.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/*
            La regla escrita como una frase, con los números adentro.
            Antes eran dos cajas con las etiquetas "CADA N ENTRADAS" y
            "DESCUENTO EN 1 (%)": correctas y bastante incomprensibles. Leída
            de corrido —"cada 3 entradas, 2 con 100% de descuento"— no hace
            falta explicar nada.
          */}
          <div className="border border-border p-3">
            <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-muted-foreground">
              La regla
            </label>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>Cada</span>
              <input
                type="number"
                min={2}
                value={form.everyN}
                onChange={(ev) => set("everyN", Number(ev.target.value))}
                className="w-16 border border-border bg-background px-2 py-1.5 text-center text-base sm:text-sm"
                aria-label="Cada cuántas entradas"
              />
              <span>entradas,</span>
              <input
                type="number"
                min={1}
                value={form.discountedUnits}
                onChange={(ev) => set("discountedUnits", Number(ev.target.value))}
                className="w-16 border border-border bg-background px-2 py-1.5 text-center text-base sm:text-sm"
                aria-label="Cuántas se descuentan"
              />
              <span>{form.discountedUnits === 1 ? "sale con" : "salen con"}</span>
              <input
                type="number"
                min={1}
                max={100}
                value={form.percentOff}
                onChange={(ev) => set("percentOff", Number(ev.target.value))}
                className="w-16 border border-border bg-background px-2 py-1.5 text-center text-base sm:text-sm"
                aria-label="Porcentaje de descuento"
              />
              <span>% de descuento{form.percentOff === 100 ? " (o sea, gratis)" : ""}</span>
            </div>
            {form.discountedUnits >= form.everyN && (
              <p className="mt-2 text-xs font-semibold text-charrua">
                Las que se descuentan tienen que ser menos que el total: si no, el grupo
                entero sale gratis.
              </p>
            )}
          </div>

          {/*
            El ejemplo en vivo es lo que hace entendible la pantalla. Se muestra
            también el doble de cantidad, porque que la promo se aplique DOS
            veces con el doble de entradas es la parte que sorprende.
          */}
          <div className="border border-celeste/40 bg-celeste/5 p-3">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-celeste-deep">
              <Tag className="h-3.5 w-3.5" /> Lo que va a pagar el cliente
            </p>
            <p className="text-sm">
              {e2.c} entradas de $1000 → <b>${e2.total}</b>{" "}
              <span className="text-muted-foreground">(se descuentan ${e2.desc})</span>
            </p>
            <p className="text-sm">
              {e4.c} entradas de $1000 → <b>${e4.total}</b>{" "}
              <span className="text-muted-foreground">(la promo entra dos veces)</span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Desde
              </label>
              <input
                type="date"
                value={form.startsAt ?? ""}
                onChange={(ev) => set("startsAt", ev.target.value)}
                className="input-techno"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Hasta
              </label>
              <input
                type="date"
                value={form.endsAt ?? ""}
                onChange={(ev) => set("endsAt", ev.target.value)}
                className="input-techno"
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Vacías = sin límite. Las dos fechas son inclusivas: una promo que termina hoy
            todavía aplica hoy.
          </p>
        </div>

        <div className="flex flex-shrink-0 gap-3 border-t border-border p-4 md:p-6">
          <button type="button" onClick={onClose} className="btn-techno-outline flex-1">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="btn-celeste flex-1">
            {saving ? "Guardando..." : editing ? "Guardar cambios" : "Crear promo"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default PromosAdmin;
