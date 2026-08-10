import { useEffect, useState } from "react";
import { X, Gift, Sparkles, Check } from "lucide-react";
import whatsappLogo from "@/assets/whatsapp-logo.png";
import PhoneInput from "./PhoneInput";
import AuthPromptStep from "./AuthPromptStep";
import { useAuth } from "@/contexts/AuthContext";
import { normalizePhone, formatPhoneDisplay, usableDocumentId } from "@/lib/validators";
import { DEFAULT_COUNTRY_CODE, getCountry } from "@/lib/locations";
import { CountryCode } from "libphonenumber-js";
import { PaymentAccount, fetchAccountForEvent } from "@/lib/paymentAccounts";
import { EventTicket } from "@/lib/ticketTypes";
import { toast } from "sonner";

interface TicketPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId?: string;
  eventName: string;
  eventDate: string;
  eventLocation: string;
  tickets: EventTicket[];
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
}: TicketPurchaseModalProps) => {
  const { currentUser, checkBirthdayPromo, claimBirthdayPromo } = useAuth();

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

  const [birthdayEligible, setBirthdayEligible] = useState(false);
  const [birthdayApplied, setBirthdayApplied] = useState(false);

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

  // Detectar elegibilidad cumple cuando se abre y el user está logueado
  useEffect(() => {
    if (!isOpen || !currentUser || !eventId) return;
    let active = true;
    checkBirthdayPromo(eventId).then((res) => {
      if (active) setBirthdayEligible(res.canClaim);
    });
    return () => {
      active = false;
    };
  }, [isOpen, currentUser, eventId, checkBirthdayPromo]);

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

  const calculateTotal = () =>
    tickets.reduce((total, t) => total + t.price * quantities[t.name], 0);

  const getSelectedTickets = () => tickets.filter((t) => quantities[t.name] > 0);

  const handleClaimBirthday = async () => {
    if (!eventId) return;
    const result = await claimBirthdayPromo(eventId);
    if (!result.ok) {
      toast.error(result.error ?? "No se pudo aplicar la promo");
      return;
    }
    setBirthdayApplied(true);
    setBirthdayEligible(false);
    toast.success("Promo cumpleaños aplicada");
  };

  const buildMessage = () => {
    const selected = getSelectedTickets();
    if (selected.length === 0) return null;

    const phoneE164 = normalizePhone(formData.phone, country as CountryCode);
    if (!phoneE164) return null;

    const firstName = formData.name.split(" ")[0];
    let msg = `Buenas! Soy ${firstName}\n`;
    msg += `Quiero comprar para ${eventName} (${eventDate}):\n`;
    selected.forEach((t) => {
      const qty = quantities[t.name];
      msg += `- ${qty} entrada${qty > 1 ? "s" : ""} ${t.name} ($${t.price * qty})\n`;
    });
    msg += `\nTOTAL: $${calculateTotal()}\n\n`;
    msg += `Mis datos:\n`;
    msg += `Nombre completo: ${formData.name}\n`;
    msg += `Email: ${formData.email}\n`;
    msg += `Teléfono: ${formatPhoneDisplay(phoneE164)}\n`;
    const document = usableDocumentId(currentUser?.documentId);
    if (document) msg += `Documento: ${document}\n`;
    if (account) {
      msg += `\nVoy a realizar la transferencia a:\n`;
      msg += `${account.holderName}\n`;
      msg += `Banco: ${account.bank}\n`;
      if (account.accountType) msg += `Tipo de cuenta: ${account.accountType}\n`;
      msg += `Nro de cuenta: ${account.accountNumber}\n`;
      if (account.documentId) msg += `Documento del titular: ${account.documentId}\n`;
    } else {
      msg += `\n¿A qué cuenta hago la transferencia?\n`;
    }
    msg += `Comprobante: `;
    return msg;
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

  const total = calculateTotal();
  const hasSelectedTickets = getSelectedTickets().length > 0;
  const isFormValid =
    !!formData.name.trim() &&
    !!formData.email.trim() &&
    !!formData.phone.trim() &&
    hasSelectedTickets;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-background border border-border"
        style={{ fontFamily: "Inter, sans-serif", letterSpacing: "normal" }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-background border-b border-border p-6 flex items-center justify-between z-10">
          <div>
            <h2 className="text-2xl font-semibold">{eventName}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {eventDate} • {eventLocation}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {step === "auth-prompt" ? (
          <AuthPromptStep
            subtitle="Si ya tenés cuenta, tus datos se completan solos. Si no, podés continuar como invitado."
            loginHint="Acelera la compra y desbloquea beneficios (promo cumpleaños, etc.)"
            registerHint="Te lleva un minuto y queda guardado para próximas compras"
            onContinue={() => setStep("purchase")}
          />
        ) : (
          <div className="p-6 space-y-8">
            {/* Banner usuario logueado */}
            {currentUser && (
              <div className="flex items-center gap-3 p-3 bg-secondary/40 border border-border">
                <Check className="w-4 h-4 text-foreground" />
                <p className="text-xs text-muted-foreground">
                  Conectado como{" "}
                  <span className="font-semibold text-foreground">{currentUser.firstName}</span>.
                  Tus datos ya están cargados.
                </p>
              </div>
            )}

            {/* Promo cumpleaños */}
            {birthdayEligible && !birthdayApplied && (
              <div className="p-4 rounded-xl border border-border bg-secondary/50 space-y-3">
                <div className="flex items-center gap-2">
                  <Gift className="w-5 h-5" />
                  <h4 className="font-semibold tracking-wide">¡TENÉS BENEFICIO CUMPLEAÑOS!</h4>
                </div>
                <p className="text-sm text-muted-foreground">
                  Tu fecha de nacimiento cae cerca de este evento. Aplicá el beneficio y avisanos
                  por WhatsApp para coordinar.
                </p>
                <button
                  type="button"
                  onClick={handleClaimBirthday}
                  className="inline-flex items-center gap-2 bg-foreground text-background px-4 py-2 text-xs tracking-wider uppercase hover:bg-foreground/90"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Aplicar promo cumpleaños
                </button>
              </div>
            )}
            {birthdayApplied && (
              <div className="flex items-center gap-2 p-3 border border-foreground bg-foreground text-background">
                <Sparkles className="w-4 h-4" />
                <p className="text-xs tracking-wide uppercase font-semibold">
                  Promo cumpleaños aplicada · Aviso en el mensaje de WhatsApp
                </p>
              </div>
            )}

            {/* Ticket Selection */}
            <div>
              <h3 className="text-lg font-medium mb-4">Seleccionar entradas</h3>
              <div className="space-y-3">
                {tickets.map((ticket) => (
                  <div
                    key={ticket.name}
                    className="flex items-center justify-between p-4 border border-border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0 pr-3">
                      <p className="font-medium">{ticket.name}</p>
                      <p className="text-sm text-muted-foreground">${ticket.price}</p>
                      {ticket.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {ticket.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => updateQuantity(ticket.name, -1)}
                        className="w-8 h-8 border border-border hover:bg-foreground hover:text-background transition-colors flex items-center justify-center disabled:opacity-40"
                        disabled={quantities[ticket.name] === 0}
                      >
                        −
                      </button>
                      <span className="w-8 text-center font-medium">
                        {quantities[ticket.name]}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(ticket.name, 1)}
                        className="w-8 h-8 border border-border hover:bg-foreground hover:text-background transition-colors flex items-center justify-center"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Total */}
            {hasSelectedTickets && (
              <div className="p-4 bg-muted border border-border">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-medium">Total</span>
                  <span className="text-2xl font-semibold">${total}</span>
                </div>
              </div>
            )}

            {/* Form */}
            {hasSelectedTickets && (
              <div>
                <h3 className="text-lg font-medium mb-4">Tus datos</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Nombre completo *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full p-3 border border-border bg-background focus:outline-none focus:border-foreground transition-colors"
                      placeholder="Tu nombre completo"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Email *</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full p-3 border border-border bg-background focus:outline-none focus:border-foreground transition-colors"
                      placeholder="tu@email.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Teléfono *</label>
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
              <div className="p-4 bg-secondary/30 border border-border space-y-3">
                <h4 className="font-medium text-base">Datos para transferencia</h4>
                {account ? (
                  <div className="text-sm space-y-1">
                    <p className="font-medium">{account.holderName}</p>
                    <p className="text-muted-foreground">
                      Nro de cuenta {account.accountNumber}
                    </p>
                    <p className="text-muted-foreground">BANCO {account.bank}</p>
                    {account.accountType && (
                      <p className="text-muted-foreground">{account.accountType}</p>
                    )}
                    {account.documentId && (
                      <p className="text-muted-foreground">
                        Documento del titular {account.documentId}
                      </p>
                    )}
                    {account.notes && (
                      <p className="text-muted-foreground pt-1">{account.notes}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Te pasamos los datos de la cuenta por WhatsApp al enviar el mensaje.
                  </p>
                )}
                <div className="mt-4 pt-3 border-t border-border/50">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <strong>Importante:</strong> Transfiere el monto total de{" "}
                    <strong>${total}</strong> a la cuenta indicada. Si te equivocas con el monto,
                    nos pondremos en contacto contigo: si es menor no enviaremos las entradas, y
                    si es mayor devolveremos el dinero en un plazo de 90 días.
                  </p>
                </div>
                <div className="mt-3 pt-3 border-t border-border/50">
                  <p className="text-xs text-muted-foreground">
                    📎 <strong>No olvides adjuntar el comprobante de transferencia</strong> (foto
                    o PDF) cuando envíes el mensaje de WhatsApp.
                  </p>
                </div>
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!isFormValid}
              className="btn-techno w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <img src={whatsappLogo} alt="WhatsApp" className="w-5 h-5" />
              <span>Enviar por WhatsApp</span>
            </button>

            {isFormValid && (
              <p className="text-xs text-center text-muted-foreground -mt-2">
                Recordá adjuntar el comprobante de pago en WhatsApp
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TicketPurchaseModal;
