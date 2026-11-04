import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Cake, Check, ChevronLeft, ChevronRight, ClipboardPaste } from "lucide-react";
import { toast } from "sonner";
import ModalAdmin from "@/components/admin/ModalAdmin";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import { useConfirm } from "@/components/ConfirmDialog";
import { CampoComprobante, type ComprobanteValor } from "@/components/admin/Comprobante";
import { AdminEvent, User, formatEventDate } from "@/contexts/AuthContext";
import { formatPhoneDisplay, phoneCountryOf } from "@/lib/validators";
import { DEFAULT_COUNTRY_CODE } from "@/lib/locations";
import { foldText } from "@/lib/utils";
import { parsePurchaseMessage, splitPurchaseMessages } from "@/lib/purchaseMessage";
import {
  createDeliveryWithTickets,
  type DeliveryInput,
  type DeliveryTicketLine,
  type TicketDelivery,
} from "@/lib/deliveries";
import { removeComprobante } from "@/lib/comprobantes";
import {
  revisarDuplicados,
  revisarEvento,
  revisarPrecios,
  type AvisoVenta,
} from "@/lib/duplicadosVenta";
import { buildConfirmacionVenta, whatsappUrl } from "@/lib/ventaMessage";

/**
 * Cargar ventas pegando los mensajes de WhatsApp (reemplaza a "Pegar mensaje").
 *
 * **El problema que resuelve no es de datos sino de tiempo.** Una sola persona
 * atiende el WhatsApp de ventas, y en plena venta masiva los mensajes quedaban
 * días sin contestar: por cada venta había que copiar los datos a un Excel,
 * reenviar el comprobante a un grupo y recién ahí responder. Acá cada venta es
 * pegar → mirar → Guardar → Responder:
 *
 * - **Varios mensajes de una vez.** Se seleccionan en WhatsApp Web, se copian
 *   y se pegan juntos; se cargan de a uno ("Venta 2 de 5"). Ver
 *   `splitPurchaseMessages`.
 * - **El comprobante se pega en la misma pantalla** (Ctrl+V) y queda en la
 *   venta (v35). Reemplaza al grupo de comprobantes.
 * - **Guardar directo**, sin pasar por el formulario, cuando el mensaje se
 *   entendió entero. Si falta algo, "Revisar en formulario" abre el de siempre
 *   con todo cargado y la cola queda esperando.
 * - **Avisos de duplicado en dos niveles** (`duplicadosVenta.ts`): la misma
 *   persona comprando dos veces para el mismo evento es normal y sólo se
 *   avisa; el mismo comprobante o la misma compra en 48 h se marca en rojo.
 * - **Responder por WhatsApp** al guardar, con la confirmación escrita.
 *
 * Archivo aparte y no dentro de `Admin.tsx` (que pasa las 4900 líneas): lo
 * nuevo empieza afuera.
 */

/**
 * Datos de un mensaje ya interpretados, para abrir el formulario con todo
 * puesto. Van como strings porque alimentan los inputs tal cual.
 */
export interface DeliveryPrefill {
  eventId: string;
  /** Vínculo al perfil si el email coincidió con un usuario registrado (v10). */
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  phoneCountry: string;
  quantity: string;
  value: string;
  notes: string;
  /** Desglose por tipo de entrada ya cruzado con el catálogo (v18). */
  lines: DeliveryTicketLine[];
  /** Comprobante ya subido desde la cola (v35). */
  receipt?: ComprobanteValor | null;
}

/** Lo que vuelve del formulario cuando guardó una venta que vino de la cola. */
export interface VentaRevisada {
  index: number;
  id?: string;
  /** Comprobante con el que quedó guardada: el form lo puede haber cambiado. */
  receiptPath?: string | null;
}

interface EstadoVenta {
  /** Evento elegido a mano: sólo se usa si el del mensaje no se pudo cruzar. */
  pickedEventId: string;
  comprobante: ComprobanteValor | null;
  /** Id de la venta guardada. Presente = ya está en "Por enviar". */
  guardadaId?: string;
  /** Respuesta para el cliente, editable antes de mandarla. */
  respuesta?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mensaje → evento, usuario, desglose y promos del catálogo. */
function interpretar(texto: string, events: AdminEvent[], users: User[], pickedEventId: string) {
  const parsed = parsePurchaseMessage(texto);
  const data = parsed.data;

  // Evento: sin tildes ni mayúsculas, y aceptando que uno contenga al otro
  // porque el nombre suele venir con adornos.
  let matchedEvent: AdminEvent | null = null;
  if (data.eventName) {
    const wanted = foldText(data.eventName).trim();
    matchedEvent =
      events.find((e) => foldText(e.name).trim() === wanted) ??
      events.find((e) => {
        const candidate = foldText(e.name).trim();
        return candidate.includes(wanted) || wanted.includes(candidate);
      }) ??
      null;
  }
  const eventId = pickedEventId || matchedEvent?.id || "";
  const selectedEvent = events.find((e) => e.id === eventId) ?? null;

  const matchedUser = data.email
    ? users.find((u) => u.email.toLowerCase() === data.email) ?? null
    : null;

  // Tipo de entrada del mensaje → los que vende el evento (v18). El precio
  // unitario sale del mensaje (subtotal ÷ cantidad): es lo que se le cobró.
  const available = selectedEvent?.tickets ?? [];
  const lines: DeliveryTicketLine[] = [];
  const unmatched: string[] = [];
  for (const item of data.items) {
    const wanted = foldText(item.name).trim();
    const type =
      available.find((t) => foldText(t.name).trim() === wanted) ??
      available.find((t) => {
        const candidate = foldText(t.name).trim();
        return candidate.includes(wanted) || wanted.includes(candidate);
      });
    if (!type) {
      unmatched.push(item.name);
      continue;
    }
    lines.push({
      ticketTypeId: type.ticketTypeId,
      name: type.name,
      quantity: item.qty,
      unitPrice: item.qty > 0 ? item.amount / item.qty : type.price,
    });
  }

  // Promo de cada línea (v24): es lo que descuenta el cupo, así que si no se
  // puede cruzar se avisa. Se busca entre TODAS las promos del evento,
  // vigentes o no: la venta a veces se carga después de que venció.
  const promosSinCruzar: string[] = [];
  for (const pl of data.promoLines) {
    const tipo = foldText(pl.ticketName).trim();
    const line = lines.find((l) => foldText(l.name).trim() === tipo);
    const promo = line
      ? (selectedEvent?.promos ?? []).find(
          (p) =>
            p.ticketTypeId === line.ticketTypeId &&
            foldText(p.name).trim() === foldText(pl.label).trim()
        )
      : undefined;
    if (line && promo) {
      line.promoId = promo.promoId;
      line.promoName = promo.name;
    } else {
      promosSinCruzar.push(`${pl.label} en ${pl.ticketName}`);
    }
  }

  const value = data.total ?? data.itemsTotal;

  // A Notas va sólo lo que no tiene dónde guardarse.
  const notes = [
    data.birthdayPromo ? "PROMO CUMPLEAÑOS" : "",
    ...data.promos,
    data.documentId ? `Doc: ${data.documentId}` : "",
    unmatched.length ? `Sin cruzar: ${unmatched.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  // Lo que impide guardar directo. No es un error: con esto pendiente, se
  // abre el formulario y se completa a mano.
  const faltan: string[] = [];
  if (!eventId) faltan.push("elegir el evento");
  if (!data.fullName) faltan.push("el nombre");
  if (!data.email || !EMAIL_RE.test(data.email)) faltan.push("un email válido");
  if (!data.phoneE164) faltan.push("un teléfono válido");
  if (data.quantity === 0) faltan.push("las entradas");
  if (value === null) faltan.push("el total");
  if (unmatched.length) faltan.push("cruzar el tipo de entrada");
  if (promosSinCruzar.length) faltan.push("cruzar la promo");

  return {
    parsed,
    data,
    matchedEvent,
    eventId,
    selectedEvent,
    matchedUser,
    lines,
    unmatched,
    promosSinCruzar,
    value,
    notes,
    faltan,
  };
}

type Interpretada = ReturnType<typeof interpretar>;

function respuestaPara(v: Interpretada): string {
  return buildConfirmacionVenta({
    nombre: v.data.fullName ?? "",
    cantidad: v.data.quantity,
    evento: v.selectedEvent?.name ?? v.data.eventName ?? "el evento",
    email: v.data.email ?? "tu email",
  });
}

function prefillDe(v: Interpretada, comprobante: ComprobanteValor | null): DeliveryPrefill {
  const { data } = v;
  return {
    eventId: v.eventId,
    userId: v.matchedUser?.id ?? "",
    fullName: data.fullName ?? "",
    email: data.email ?? "",
    // El input de teléfono espera el número sin el prefijo internacional.
    phone: data.phoneE164
      ? formatPhoneDisplay(data.phoneE164).replace(/^\+\d+\s*/, "")
      : data.phoneRaw ?? "",
    phoneCountry: phoneCountryOf(data.phoneE164) ?? DEFAULT_COUNTRY_CODE,
    quantity: data.quantity > 0 ? String(data.quantity) : "1",
    value: v.value !== null ? String(v.value) : "",
    notes: v.notes,
    lines: v.lines,
    receipt: comprobante,
  };
}

const CargarVentasModal = ({
  events,
  users,
  existing,
  oculto = false,
  revisada,
  onClose,
  onSaved,
  onRevisar,
}: {
  events: AdminEvent[];
  users: User[];
  existing: TicketDelivery[];
  /**
   * Mientras el formulario está abierto la cola se esconde pero NO se
   * desmonta: así no se pierden las ventas que quedan por cargar.
   */
  oculto?: boolean;
  /** El formulario guardó una venta de la cola. */
  revisada: VentaRevisada | null;
  onClose: () => void;
  /** Recargar la lista después de guardar. */
  onSaved: () => Promise<void> | void;
  /** Abrir el formulario de siempre con la venta `index` cargada. */
  onRevisar: (index: number, prefill: DeliveryPrefill) => void;
}) => {
  const confirm = useConfirm();
  const [fase, setFase] = useState<"pegar" | "revisar">("pegar");
  const [texto, setTexto] = useState("");
  const [ventas, setVentas] = useState<string[]>([]);
  const [estados, setEstados] = useState<EstadoVenta[]>([]);
  const [index, setIndex] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (fase === "pegar" && !oculto) areaRef.current?.focus();
  }, [fase, oculto]);

  const estado: EstadoVenta | undefined = estados[index];
  const actual = useMemo(
    () =>
      fase === "revisar" && ventas[index] !== undefined
        ? interpretar(ventas[index], events, users, estado?.pickedEventId ?? "")
        : null,
    [fase, ventas, index, events, users, estado?.pickedEventId]
  );

  const setEstado = (i: number, patch: Partial<EstadoVenta>) =>
    setEstados((prev) => prev.map((e, k) => (k === i ? { ...e, ...patch } : e)));

  // El formulario guardó una venta de la cola: queda marcada como cargada.
  useEffect(() => {
    if (!revisada) return;
    const previo = estados[revisada.index];
    // Si el formulario cambió el comprobante, el que se subió acá quedó suelto.
    if (previo?.comprobante && revisada.receiptPath !== previo.comprobante.path) {
      void removeComprobante(previo.comprobante.path);
    }
    const v = ventas[revisada.index];
    setEstado(revisada.index, {
      guardadaId: revisada.id ?? "formulario",
      comprobante: null,
      respuesta: v
        ? respuestaPara(interpretar(v, events, users, previo?.pickedEventId ?? ""))
        : undefined,
    });
    setIndex(revisada.index);
    // Sólo reacciona a un resultado nuevo del formulario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revisada]);

  const empezar = (t: string) => {
    const partes = splitPurchaseMessages(t);
    if (partes.length === 0) {
      toast.error("Pegá al menos un mensaje");
      return;
    }
    setVentas(partes);
    setEstados(partes.map(() => ({ pickedEventId: "", comprobante: null })));
    setIndex(0);
    setFase("revisar");
  };

  /** Cambiar o quitar el comprobante de una venta NO guardada borra el anterior. */
  const setComprobante = (valor: ComprobanteValor | null) => {
    const previo = estado?.comprobante;
    if (previo && previo.path !== valor?.path) void removeComprobante(previo.path);
    setEstado(index, { comprobante: valor });
  };

  const pendientes = estados.filter((e) => !e.guardadaId).length;

  /**
   * Cierre con red: con ventas sin cargar, pregunta. Escape y el velo también
   * pasan por acá, y un Escape mal apretado no puede tirar cinco ventas.
   */
  const pedirCierre = async () => {
    // Escape sobre un diálogo de confirmación abierto: lo cierra el diálogo,
    // no la cola. Radix lo saca del DOM recién después de este evento.
    if (document.querySelector('[role="alertdialog"]')) return;
    if (fase === "revisar" && pendientes > 0 && estados.length > 0) {
      const ok = await confirm({
        title: "Quedan ventas sin cargar",
        description: `${pendientes} de ${estados.length} venta(s) no se guardaron. Si cerrás, se pierden (los mensajes siguen en WhatsApp).`,
        confirmText: "Cerrar igual",
        destructive: true,
      });
      if (!ok) return;
    }
    // Lo subido para ventas que no se guardaron no lo referencia nadie.
    for (const e of estados) {
      if (!e.guardadaId && e.comprobante) void removeComprobante(e.comprobante.path);
    }
    onClose();
  };

  const avisos: AvisoVenta[] = useMemo(() => {
    if (!actual || estado?.guardadaId) return [];
    const { data, eventId, selectedEvent, lines, value } = actual;
    return [
      ...revisarDuplicados(
        {
          eventId,
          email: data.email,
          phone: data.phoneE164,
          quantity: data.quantity,
          value,
          receiptHash: estado?.comprobante?.hash,
        },
        existing,
        { nombreEvento: (id) => events.find((e) => e.id === id)?.name ?? "otro evento" }
      ),
      ...revisarEvento(selectedEvent),
      ...revisarPrecios(lines, selectedEvent?.tickets ?? []),
      ...actual.parsed.warnings.map((texto): AvisoVenta => ({ nivel: "aviso", texto })),
    ];
  }, [actual, estado?.guardadaId, estado?.comprobante?.hash, existing, events]);

  const fuertes = avisos.filter((a) => a.nivel === "fuerte");
  const leves = avisos.filter((a) => a.nivel === "aviso");

  const guardar = async () => {
    if (!actual || !estado || actual.faltan.length > 0) return;
    const { data, eventId, lines, value, matchedUser, notes } = actual;

    if (fuertes.length > 0) {
      const ok = await confirm({
        title: "Puede estar repetida",
        description: `${fuertes.map((f) => f.texto).join(" ")} ¿La cargás igual?`,
        confirmText: "Cargar igual",
      });
      if (!ok) return;
    }
    if (!estado.comprobante) {
      const ok = await confirm({
        title: "Sin comprobante",
        description:
          "No pegaste el comprobante. Podés agregarlo después editando la venta. ¿Guardar así?",
        confirmText: "Guardar sin comprobante",
      });
      if (!ok) return;
    }

    const parts = (data.fullName ?? "").trim().split(/\s+/);
    const input: DeliveryInput = {
      eventId,
      userId: matchedUser?.id ?? null,
      firstName: parts[0] ?? "",
      lastName: parts.slice(1).join(" "),
      phone: data.phoneE164,
      email: data.email ?? "",
      quantity: data.quantity,
      value: value ?? 0,
      notes: notes || null,
      // Sólo si hay: sin la migración v35, una venta sin comprobante se guarda igual.
      ...(estado.comprobante
        ? { receiptPath: estado.comprobante.path, receiptHash: estado.comprobante.hash ?? null }
        : {}),
    };

    setGuardando(true);
    const result = await createDeliveryWithTickets(input, lines);
    setGuardando(false);
    if (!result.id) {
      toast.error(result.error ?? "No se pudo guardar la venta");
      return;
    }
    // Con id pero con error: la venta existe y el desglose no. Se marca como
    // cargada igual para no volver a crearla, y se avisa.
    if (!result.ok) toast.error(result.error ?? "Se guardó la venta con un error");
    else toast.success("Venta cargada en Por enviar");
    setEstado(index, { guardadaId: result.id, respuesta: respuestaPara(actual) });
    await onSaved();
  };

  const siguiente = () => {
    // Salta a la próxima que falte cargar; si no queda ninguna, a la de al lado.
    const proxima = estados.findIndex((e, k) => k > index && !e.guardadaId);
    const vuelta = estados.findIndex((e) => !e.guardadaId);
    if (proxima !== -1) setIndex(proxima);
    else if (vuelta !== -1) setIndex(vuelta);
  };

  if (oculto) return null;

  // ─── Fase 1: pegar ────────────────────────────────────────────────────────
  if (fase === "pegar") {
    const cuantas = splitPurchaseMessages(texto).length;
    return (
      <ModalAdmin
        titulo="Cargar ventas"
        subtitulo="Pegá uno o varios mensajes de WhatsApp"
        onClose={pedirCierre}
        pie={
          <>
            <button type="button" onClick={pedirCierre} className="btn-techno-outline">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => empezar(texto)}
              disabled={!texto.trim()}
              className="btn-celeste disabled:cursor-not-allowed disabled:opacity-40"
            >
              {cuantas > 1 ? `Cargar ${cuantas} ventas` : "Leer mensaje"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Copiá el mensaje que te mandó el cliente y pegalo acá (Ctrl+V). Para cargar{" "}
            <b className="text-foreground">varias ventas de una vez</b>, en WhatsApp Web seleccioná
            los mensajes (flechita del mensaje → Seleccionar), copialos y pegalos juntos: los
            separo y los cargás de a uno.
          </p>
          <textarea
            ref={areaRef}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onPaste={(e) => {
              // Pegar en el cuadro vacío arranca solo: es el caso de todos los
              // días y no tiene sentido pedir un click más.
              const pegado = e.clipboardData.getData("text");
              if (!pegado || texto.trim()) return;
              e.preventDefault();
              setTexto(pegado);
              if (splitPurchaseMessages(pegado).length > 0) empezar(pegado);
            }}
            rows={10}
            placeholder={"Buenas! Soy Juan\nQuiero comprar para ..."}
            className="input-techno resize-y font-mono text-xs leading-relaxed"
          />
          {cuantas > 1 && (
            <p className="text-xs font-semibold">Encontré {cuantas} mensajes de compra.</p>
          )}
        </div>
      </ModalAdmin>
    );
  }

  // ─── Fase 2: revisar de a una ─────────────────────────────────────────────
  if (!actual || !estado) return null;
  const { data, matchedEvent, eventId, selectedEvent, matchedUser } = actual;
  const guardada = !!estado.guardadaId;
  const urlRespuesta = guardada ? whatsappUrl(data.phoneE164, estado.respuesta ?? "") : null;
  const total = estados.length;
  const quedanOtras = estados.some((e, k) => k !== index && !e.guardadaId);

  return (
    <ModalAdmin
      titulo={total > 1 ? `Venta ${index + 1} de ${total}` : "Cargar venta"}
      subtitulo={
        total > 1
          ? `${total - pendientes} cargada(s) · ${pendientes} por cargar`
          : selectedEvent?.name ?? data.eventName ?? undefined
      }
      onClose={pedirCierre}
      pie={
        guardada ? (
          <>
            <button type="button" onClick={pedirCierre} className="btn-techno-outline">
              {quedanOtras ? "Cerrar" : "Terminar"}
            </button>
            {quedanOtras && (
              <button type="button" onClick={siguiente} className="btn-celeste inline-flex items-center justify-center gap-2">
                Siguiente venta <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </>
        ) : (
          <>
            {/* Sin botón "Saltar": las flechas y los números de arriba ya lo
                hacen, y en celular un tercer botón apilado se come el pie. */}
            <button
              type="button"
              onClick={() => onRevisar(index, prefillDe(actual, estado.comprobante))}
              className="btn-techno-outline"
            >
              Revisar en formulario
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={guardando || actual.faltan.length > 0}
              className="btn-celeste disabled:cursor-not-allowed disabled:opacity-40"
            >
              {guardando ? "Guardando…" : "Guardar"}
            </button>
          </>
        )
      }
    >
      <div className="space-y-4">
        {/* Navegación de la cola: cada número es una venta; ✓ = ya cargada. */}
        {total > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              className="flex h-11 w-11 items-center justify-center border border-border disabled:opacity-30"
              aria-label="Venta anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
              {estados.map((e, k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setIndex(k)}
                  aria-label={`Venta ${k + 1}${e.guardadaId ? ", cargada" : ""}`}
                  className={`flex h-11 min-w-[44px] items-center justify-center border text-xs font-bold ${
                    k === index
                      ? "border-foreground bg-foreground text-background"
                      : e.guardadaId
                        ? "border-green-600/40 bg-green-600/10 text-green-700"
                        : "border-border"
                  }`}
                >
                  {e.guardadaId ? <Check className="h-4 w-4" /> : k + 1}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
              disabled={index === total - 1}
              className="flex h-11 w-11 items-center justify-center border border-border disabled:opacity-30"
              aria-label="Venta siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {guardada ? (
          <div className="space-y-3">
            <div className="border border-green-600/40 bg-green-600/10 p-3 text-sm">
              <p className="flex items-center gap-2 font-semibold text-green-700">
                <Check className="h-4 w-4" /> Cargada en Por enviar
              </p>
              <p className="mt-1 text-muted-foreground">
                {data.fullName} · {data.quantity} entrada(s) ·{" "}
                {selectedEvent?.name ?? "evento"}
              </p>
            </div>

            <div>
              <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Respuesta para el cliente
              </span>
              <textarea
                value={estado.respuesta ?? ""}
                onChange={(e) => setEstado(index, { respuesta: e.target.value })}
                rows={7}
                className="input-techno resize-y text-sm"
              />
              {urlRespuesta ? (
                <a
                  href={urlRespuesta}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-celeste mt-2 inline-flex w-full items-center justify-center gap-2"
                >
                  <WhatsAppIcon className="h-5 w-5" /> Responder por WhatsApp
                </a>
              ) : (
                <p className="mt-2 text-xs text-charrua">
                  El mensaje no trae un teléfono válido, así que no puedo abrir el chat. Copiá la
                  respuesta y mandala a mano.
                </p>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="divide-y divide-border border border-border">
              <div className="flex items-center justify-between bg-secondary/50 px-4 py-2.5">
                <span className="text-xs font-bold uppercase tracking-wider">Lo que entendí</span>
                {matchedUser && (
                  <span className="inline-flex items-center whitespace-nowrap rounded-full border border-celeste/30 bg-celeste/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-celeste-deep">
                    Registrado
                  </span>
                )}
              </div>

              <Fila label="Evento">
                {matchedEvent && !estado.pickedEventId ? (
                  <span>
                    {matchedEvent.name}{" "}
                    <span className="text-xs text-muted-foreground">· {formatEventDate(matchedEvent.date)}</span>
                  </span>
                ) : (
                  <select
                    value={eventId}
                    onChange={(e) => setEstado(index, { pickedEventId: e.target.value })}
                    className="input-techno py-1.5 text-sm"
                  >
                    <option value="">
                      {data.eventName ? `No encontré "${data.eventName}": elegilo` : "Elegí el evento"}
                    </option>
                    {events.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} · {formatEventDate(e.date)}
                      </option>
                    ))}
                  </select>
                )}
              </Fila>
              <Fila label="Nombre">{data.fullName}</Fila>
              <Fila label="Email">{data.email}</Fila>
              <Fila label="Teléfono">
                {data.phoneE164 ? formatPhoneDisplay(data.phoneE164) : data.phoneRaw}
              </Fila>
              {data.documentId && <Fila label="Documento">{data.documentId}</Fila>}
              <Fila label="Entradas">
                {data.quantity > 0 ? (
                  <span>
                    {data.quantity} · {data.itemsSummary}
                    {actual.unmatched.length > 0 && (
                      <span className="mt-0.5 block text-xs text-charrua">
                        No pude cruzar {actual.unmatched.join(", ")} con los tipos que vende el
                        evento.
                      </span>
                    )}
                  </span>
                ) : null}
              </Fila>
              <Fila label="Total">
                {actual.value !== null ? (
                  <b>${actual.value.toLocaleString("es-UY")}</b>
                ) : null}
              </Fila>
              {data.birthdayPromo && (
                <Fila label="Promo">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-celeste-deep">
                    <Cake className="h-3.5 w-3.5" /> Cumpleaños aplicada
                  </span>
                </Fila>
              )}
              {data.promos.map((p) => (
                <Fila key={p} label="Promo">
                  <span className="font-semibold text-celeste-deep">{p}</span>
                </Fila>
              ))}
              {actual.promosSinCruzar.length > 0 && (
                <Fila label="Ojo">
                  <span className="text-xs text-charrua">
                    No encontré {actual.promosSinCruzar.join(", ")} entre las promos del evento.
                    Elegila en el formulario: si no, esta venta no descuenta el cupo.
                  </span>
                </Fila>
              )}
            </div>

            <CampoComprobante valor={estado.comprobante} onChange={setComprobante} />

            {fuertes.length > 0 && (
              <Avisos titulo="Puede estar repetida" tono="fuerte" avisos={fuertes} />
            )}
            {leves.length > 0 && <Avisos titulo="Para mirar" tono="aviso" avisos={leves} />}

            {actual.faltan.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Para guardar directo falta {actual.faltan.join(", ")}. Tocá{" "}
                <b className="text-foreground">Revisar en formulario</b> para completarlo.
              </p>
            )}

            <details className="text-xs">
              <summary className="inline-flex cursor-pointer items-center gap-1.5 text-muted-foreground">
                <ClipboardPaste className="h-3.5 w-3.5" /> Ver el mensaje original
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap border border-border bg-secondary/40 p-3 font-mono text-[11px] leading-relaxed">
                {ventas[index]}
              </pre>
            </details>
          </>
        )}
      </div>
    </ModalAdmin>
  );
};

/** Fila del resumen de lo leído. Sin valor muestra un guión apagado. */
const Fila = ({ label, children }: { label: string; children?: ReactNode }) => (
  <div className="flex items-baseline gap-3 px-4 py-2 text-sm">
    <span className="w-24 shrink-0 text-xs uppercase tracking-wider text-muted-foreground">
      {label}
    </span>
    <span className="min-w-0 flex-1 break-words">
      {children || <span className="text-muted-foreground">—</span>}
    </span>
  </div>
);

const Avisos = ({
  titulo,
  tono,
  avisos,
}: {
  titulo: string;
  tono: "fuerte" | "aviso";
  avisos: AvisoVenta[];
}) => (
  <div
    role={tono === "fuerte" ? "alert" : undefined}
    className={`space-y-1.5 border p-3 ${
      tono === "fuerte" ? "border-charrua/60 bg-charrua/10" : "border-amber-500/40 bg-amber-500/10"
    }`}
  >
    <p
      className={`text-xs font-bold uppercase tracking-wider ${
        tono === "fuerte" ? "text-charrua" : "text-amber-700"
      }`}
    >
      {titulo}
    </p>
    {avisos.map((a) => (
      <p
        key={a.texto}
        className={`flex items-start gap-2 text-xs ${tono === "fuerte" ? "text-charrua" : "text-foreground"}`}
      >
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {a.texto}
      </p>
    ))}
  </div>
);

export default CargarVentasModal;
