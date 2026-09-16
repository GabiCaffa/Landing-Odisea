import { useEffect, useState } from "react";
import { X, Check } from "lucide-react";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import PhoneInput from "./PhoneInput";
import AuthPromptStep from "./AuthPromptStep";
import ModalShell from "./ModalShell";
import { useAuth } from "@/contexts/AuthContext";
import { normalizePhone, formatPhoneDisplay, usableDocumentId } from "@/lib/validators";
import { DEFAULT_COUNTRY_CODE } from "@/lib/locations";
import { CountryCode } from "libphonenumber-js";
import { PaymentAccount, fetchAccountForEvent } from "@/lib/paymentAccounts";
import { EventTicket } from "@/lib/ticketTypes";
import { EventPromo, mejorDescuento, promoVigente } from "@/lib/ticketPromos";
import { buildPurchaseMessage } from "@/lib/purchaseMessage";
import { toast } from "sonner";

interface TicketPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId?: string;
  eventName: string;
  eventDate: string;
  eventLocation: string;
  tickets: EventTicket[];
  /** Promos de entrada del evento (v21). Vacío = sin promos. */
  promos?: EventPromo[];
}

type Step = "auth-prompt" | "purchase";

const TicketPurchaseModal = ({
  isOpen,
  onClose,
  eventId,
  eventName,
  eventDate,
  eventLocation,
  tickets,
  promos = [],
}: TicketPurchaseModalProps) => {
  const { currentUser } = useAuth();

  const [step, setStep] = useState<Step>("auth-prompt");

  const [quantities, setQuantities] = useState<{ [key: string]: number }>(
    tickets.reduce((acc, t) => ({ ...acc, [t.name]: 0 }), {})
  );

  const [country, setCountry] = useState(currentUser?.country ?? DEFAULT_COUNTRY_CODE);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
  });

  // Cuenta de cobro del evento (la carga el admin desde el panel).
  const [account, setAccount] = useState<PaymentAccount | null>(null);

  // Si el user ya está logueado, saltamos el prompt y prellenamos
  useEffect(() => {
    if (!isOpen) return;
    if (currentUser) {
      setStep("purchase");
      setCountry(currentUser.country ?? DEFAULT_COUNTRY_CODE);
      setFormData({
        name: `${currentUser.firstName} ${currentUser.lastName}`,
        email: currentUser.email,
        phone: currentUser.phone
          ? formatPhoneDisplay(currentUser.phone).replace(/^\+\d+\s*/, "")
          : "",
      });
    } else {
      setStep("auth-prompt");
    }
  }, [isOpen, currentUser]);

  // Datos de transferencia del evento. Si el evento no tiene cuenta (o falla la
  // consulta) no inventamos nada: se oculta el bloque y se pide por WhatsApp.
  useEffect(() => {
    if (!isOpen || !eventId) {
      setAccount(null);
      return;
    }
    let active = true;
    fetchAccountForEvent(eventId).then((acc) => {
      if (active) setAccount(acc);
    });
    return () => {
      active = false;
    };
  }, [isOpen, eventId]);

  if (!isOpen) return null;

  const updateQuantity = (ticketName: string, change: number) => {
    setQuantities((prev) => ({
      ...prev,
      [ticketName]: Math.max(0, prev[ticketName] + change),
    }));
  };

  const getSelectedTickets = () => tickets.filter((t) => quantities[t.name] > 0);

  /**
   * Cada tipo de entrada con su promo ya resuelta.
   *
   * Se calcula una sola vez y de acá salen las tres cosas que tienen que dar lo
   * mismo: lo que se ve en pantalla, el TOTAL y el mensaje de WhatsApp. Antes
   * el total se recalculaba en dos lugares; con descuentos de por medio eso es
   * pedir que algún día muestren números distintos.
   */
  const lineas = tickets.map((t) => {
    const qty = quantities[t.name] ?? 0;
    const bruto = t.price * qty;
    const d = qty > 0 ? mejorDescuento(promos, t.ticketTypeId, t.price, qty) : null;
    return { ticket: t, qty, bruto, descuento: d, subtotal: bruto - (d?.monto ?? 0) };
  });

  const total = lineas.reduce((acc, l) => acc + l.subtotal, 0);
  const ahorro = lineas.reduce((acc, l) => acc + (l.descuento?.monto ?? 0), 0);

  /** Promos vigentes de un tipo, para mostrarlas aunque todavía no se apliquen. */
  const promosDe = (ticketTypeId: string) =>
    promos.filter((p) => p.ticketTypeId === ticketTypeId && promoVigente(p));

  const buildMessage = () => {
    const selected = getSelectedTickets();
    if (selected.length === 0) return null;

    const phoneE164 = normalizePhone(formData.phone, country as CountryCode);
    if (!phoneE164) return null;

    // El formato vive en @/lib/purchaseMessage, al lado del parser que lo lee
    // en el panel para cargar la entrega. No armar el texto acá.
    return buildPurchaseMessage({
      fullName: formData.name,
      email: formData.email,
      phoneE164,
      documentId: usableDocumentId(currentUser?.documentId),
      eventName,
      eventDate,
      // Los subtotales salen de `lineas`, ya con la promo descontada, así que
      // los ítems del mensaje suman el TOTAL y el importador del panel no
      // necesita saber nada de promos para que la cuenta cierre.
      items: selected.map((t) => {
        const l = lineas.find((x) => x.ticket.name === t.name)!;
        return { name: t.name, qty: l.qty, price: t.price, subtotal: l.subtotal };
      }),
      promos: lineas
        .filter((l) => l.descuento)
        .map((l) => ({
          label: l.descuento!.promo.name,
          ticketName: l.ticket.name,
          monto: l.descuento!.monto,
        })),
      total,
      account,
    });
  };

  const handleSubmit = () => {
    if (!formData.name.trim() || !formData.email.trim() || !formData.phone.trim()) {
      toast.error("Completá tus datos");
      return;
    }
    const phoneE164 = normalizePhone(formData.phone, country as CountryCode);
    if (!phoneE164) {
      toast.error("Teléfono inválido");
      return;
    }
    const message = buildMessage();
    if (!message) return;
    const url = `https://wa.me/59892592179?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
    onClose();
  };

  const hasSelectedTickets = getSelectedTickets().length > 0;
  const isFormValid =
    !!formData.name.trim() &&
    !!formData.email.trim() &&
    !!formData.phone.trim() &&
    hasSelectedTickets;

  return (
    <ModalShell onClose={onClose} etiqueta={`Comprar entradas para ${eventName}`}>
      {/*
        Encabezado FIJO. Antes era `sticky` dentro del panel que scrolleaba, con
        `p-6` y el título en `text-2xl`: medido en un celular de 360 px se comía
        157 px, el 23% del modal, y un nombre largo de evento lo hacía crecer
        todavía más. Ahora es un hijo flex que no se encoge, y las medidas suben
        recién en `sm:`.
      */}
      <div className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-border p-4 sm:p-6">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-tight sm:text-2xl">{eventName}</h2>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            {eventDate} • {eventLocation}
          </p>
        </div>
        <button
          onClick={onClose}
          // 44x44 es el mínimo táctil de las guías de accesibilidad; venía de
          // 40x40, que en un pulgar se falla.
          className="-mr-2 -mt-1 flex h-11 w-11 flex-shrink-0 items-center justify-center transition-colors hover:bg-muted"
          aria-label="Cerrar"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      {step === "auth-prompt" ? (
        <div className="flex-1 overflow-y-auto">
          <AuthPromptStep
            subtitle="Si ya tenés cuenta, tus datos se completan solos. Si no, podés continuar como invitado."
            loginHint="Acelera la compra: tus datos se completan solos"
            registerHint="Te lleva un minuto y queda guardado para próximas compras"
            onContinue={() => setStep("purchase")}
          />
        </div>
      ) : (
        <>
          {/* El cuerpo es lo ÚNICO que scrollea. */}
          <div
            className="flex-1 space-y-6 overflow-y-auto p-4 sm:space-y-8 sm:p-6"
            style={{ fontFamily: "Inter, sans-serif", letterSpacing: "normal" }}
          >
            {/* Banner usuario logueado */}
            {currentUser && (
              <div className="flex items-center gap-3 border border-border bg-secondary/40 p-3">
                <Check className="h-4 w-4 flex-shrink-0 text-foreground" />
                <p className="text-xs text-muted-foreground">
                  Conectado como{" "}
                  <span className="font-semibold text-foreground">{currentUser.firstName}</span>.
                  Tus datos ya están cargados.
                </p>
              </div>
            )}

            {/* Ticket Selection */}
            <div>
              <h3 className="mb-3 text-base font-medium sm:mb-4 sm:text-lg">
                Seleccionar entradas
              </h3>
              <div className="space-y-3">
                {tickets.map((ticket) => (
                  <div
                    key={ticket.name}
                    // En celular el nombre va arriba y el contador abajo: con
                    // los dos en la misma fila, un nombre como "Backstage +23"
                    // se partía en dos líneas contra el contador.
                    className="flex flex-col gap-3 border border-border p-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between sm:p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium leading-tight">{ticket.name}</p>
                      <p className="text-sm text-muted-foreground">${ticket.price}</p>
                      {ticket.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {ticket.description}
                        </p>
                      )}
                      {/*
                        La promo se muestra ANTES de que se aplique: si sólo
                        apareciera al llegar a la cantidad, nadie se enteraría de
                        que existe y nunca la usaría. Se nombra la etiqueta que
                        escribió el admin ("2x1") — nunca el mecanismo interno
                        ("cada 2, 1 al 100%"), que no le dice nada al cliente.
                      */}
                      {promosDe(ticket.ticketTypeId).map((p) => {
                        const l = lineas.find((x) => x.ticket.name === ticket.name);
                        const aplicada = l?.descuento?.promo.promoId === p.promoId;
                        return (
                          <p
                            key={p.id}
                            className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                              aplicada
                                ? "bg-celeste text-accent-foreground"
                                : "border border-celeste/40 text-celeste-deep"
                            }`}
                          >
                            {p.name}
                            {aplicada && l?.descuento ? ` · −$${l.descuento.monto}` : ""}
                          </p>
                        );
                      })}
                    </div>
                    <div className="flex flex-shrink-0 items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => updateQuantity(ticket.name, -1)}
                        className="flex h-11 w-11 items-center justify-center border border-border text-lg transition-colors hover:bg-foreground hover:text-background disabled:opacity-40"
                        disabled={quantities[ticket.name] === 0}
                        aria-label={`Quitar una entrada ${ticket.name}`}
                      >
                        −
                      </button>
                      <span
                        className="w-8 text-center text-lg font-medium tabular-nums"
                        aria-live="polite"
                      >
                        {quantities[ticket.name]}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(ticket.name, 1)}
                        className="flex h-11 w-11 items-center justify-center border border-border text-lg transition-colors hover:bg-foreground hover:text-background"
                        aria-label={`Agregar una entrada ${ticket.name}`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Form */}
            {hasSelectedTickets && (
              <div>
                <h3 className="mb-3 text-base font-medium sm:mb-4 sm:text-lg">Tus datos</h3>
                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium" htmlFor="compra-nombre">
                      Nombre completo *
                    </label>
                    <input
                      id="compra-nombre"
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      // text-base = 16px. Por debajo de eso Safari de iOS hace
                      // zoom al enfocar el campo y descoloca todo el modal.
                      className="w-full border border-border bg-background p-3 text-base transition-colors focus:border-foreground focus:outline-none"
                      placeholder="Tu nombre completo"
                      autoComplete="name"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium" htmlFor="compra-email">
                      Email *
                    </label>
                    <input
                      id="compra-email"
                      type="email"
                      inputMode="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full border border-border bg-background p-3 text-base transition-colors focus:border-foreground focus:outline-none"
                      placeholder="tu@email.com"
                      autoComplete="email"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium">Teléfono *</label>
                    <PhoneInput
                      country={country}
                      value={formData.phone}
                      onCountryChange={setCountry}
                      onChange={(v) => setFormData({ ...formData, phone: v })}
                      autoComplete="tel"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Bank Info */}
            {hasSelectedTickets && isFormValid && (
              <div className="space-y-3 border border-border bg-secondary/30 p-4">
                <h4 className="text-base font-medium">Datos para transferencia</h4>
                {account ? (
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">{account.holderName}</p>
                    {/* break-words: un número de cuenta largo desbordaba el
                        modal a lo ancho en celular. */}
                    <p className="break-words text-muted-foreground">
                      Nro de cuenta {account.accountNumber}
                    </p>
                    <p className="text-muted-foreground">BANCO {account.bank}</p>
                    {account.accountType && (
                      <p className="text-muted-foreground">{account.accountType}</p>
                    )}
                    {account.documentId && (
                      <p className="break-words text-muted-foreground">
                        Documento del titular {account.documentId}
                      </p>
                    )}
                    {account.notes && (
                      <p className="pt-1 text-muted-foreground">{account.notes}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Te pasamos los datos de la cuenta por WhatsApp al enviar el mensaje.
                  </p>
                )}
                <div className="mt-4 border-t border-border/50 pt-3">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    <strong>Importante:</strong> Transfiere el monto total de{" "}
                    <strong>${total}</strong> a la cuenta indicada. Si te equivocas con el monto,
                    nos pondremos en contacto contigo: si es menor no enviaremos las entradas, y
                    si es mayor devolveremos el dinero en un plazo de 90 días.
                  </p>
                </div>
                <div className="mt-3 border-t border-border/50 pt-3">
                  <p className="text-xs text-muted-foreground">
                    📎 <strong>No olvides adjuntar el comprobante de transferencia</strong> (foto
                    o PDF) cuando envíes el mensaje de WhatsApp.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/*
            Pie FIJO con el total y el botón.

            Antes los dos vivían al final del contenido que scrollea, así que en
            un celular quedaban debajo del pliegue: había que bajar hasta el
            fondo para ver cuánto se estaba por pagar y para poder enviar. En un
            flujo que cobra plata, el total y el CTA tienen que estar siempre a
            la vista. El `env(safe-area-inset-bottom)` lo despega de la barra de
            gestos del iPhone.
          */}
          <div
            className="flex-shrink-0 space-y-3 border-t border-border bg-background p-4 sm:p-6"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
          >
            {hasSelectedTickets && (
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Total</span>
                  {/* El ahorro va junto al total y no arriba: es el número que
                      convence, y arriba se lo come el scroll del cuerpo. */}
                  {ahorro > 0 && (
                    <p className="text-xs font-semibold text-celeste-deep">
                      Ahorrás ${ahorro}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  {ahorro > 0 && (
                    <span className="mr-2 text-sm text-muted-foreground line-through tabular-nums">
                      ${total + ahorro}
                    </span>
                  )}
                  <span className="text-2xl font-semibold tabular-nums">${total}</span>
                </div>
              </div>
            )}
            <button
              onClick={handleSubmit}
              disabled={!isFormValid}
              className="btn-techno w-full disabled:cursor-not-allowed disabled:opacity-50"
            >
              <WhatsAppIcon className="h-5 w-5" />
              <span>Enviar por WhatsApp</span>
            </button>
            {isFormValid && (
              <p className="text-center text-xs text-muted-foreground">
                Recordá adjuntar el comprobante de pago en WhatsApp
              </p>
            )}
          </div>
        </>
      )}
    </ModalShell>
  );
};

export default TicketPurchaseModal;
