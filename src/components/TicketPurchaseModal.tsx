import { useState } from "react";
import { X } from "lucide-react";
import whatsappLogo from "@/assets/whatsapp-logo.png";

interface Ticket {
  name: string;
  price: number;
}

interface TicketPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventName: string;
  eventDate: string;
  eventLocation: string;
  tickets: Ticket[];
}

const TicketPurchaseModal = ({
  isOpen,
  onClose,
  eventName,
  eventDate,
  eventLocation,
  tickets,
}: TicketPurchaseModalProps) => {
  const [quantities, setQuantities] = useState<{ [key: string]: number }>(
    tickets.reduce((acc, ticket) => ({ ...acc, [ticket.name]: 0 }), {})
  );
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
  });

  if (!isOpen) return null;

  const updateQuantity = (ticketName: string, change: number) => {
    setQuantities((prev) => ({
      ...prev,
      [ticketName]: Math.max(0, prev[ticketName] + change),
    }));
  };

  const calculateTotal = () => {
    return tickets.reduce((total, ticket) => {
      return total + ticket.price * quantities[ticket.name];
    }, 0);
  };

  const getSelectedTickets = () => {
    return tickets.filter((ticket) => quantities[ticket.name] > 0);
  };

  const generateWhatsAppMessage = () => {
    const selectedTickets = getSelectedTickets();
    if (selectedTickets.length === 0 || !formData.name || !formData.email || !formData.phone) {
      return null;
    }

    const firstName = formData.name.split(' ')[0];
    let message = `Buenas! Soy ${firstName}\n`;
    message += `Quiero comprar para ${eventName} (${eventDate}):\n`;
    
    selectedTickets.forEach((ticket) => {
      const qty = quantities[ticket.name];
      const subtotal = ticket.price * qty;
      message += `- ${qty} entrada${qty > 1 ? 's' : ''} ${ticket.name} ($${subtotal})\n`;
    });
    
    message += `\nTOTAL: $${calculateTotal()}\n\n`;
    message += `Mis datos:\n`;
    message += `Nombre completo: ${formData.name}\n`;
    message += `Email: ${formData.email}\n`;
    message += `Teléfono: ${formData.phone}\n\n`;
    message += `Voy a realizar la transferencia a:\n`;
    message += `JOSE IGNACIO FANETTI PEDULLA\n`;
    message += 'SANTANDER\n'
    message += 'Tipo de cuenta: CAJA DE AHORRO PESOS\n'
    message += `Nro de cuenta: 3895198000\n`;
    message += `Comprobante: `;

   return message;
  };

  const handleSubmit = () => {
    const message = generateWhatsAppMessage();
    if (message) {
      const whatsappUrl = `https://wa.me/59891816716?text=${encodeURIComponent(message)}`;
      window.open(whatsappUrl, "_blank");
      onClose();
    }
  };

  const total = calculateTotal();
  const hasSelectedTickets = getSelectedTickets().length > 0;
  const isFormValid = formData.name && formData.email && formData.phone && hasSelectedTickets;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-background border border-border" style={{ fontFamily: 'Inter, sans-serif', letterSpacing: 'normal' }}>
        {/* Header */}
        <div className="sticky top-0 bg-background border-b border-border p-6 flex items-center justify-between">
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

        <div className="p-6 space-y-8">
          {/* Ticket Selection */}
          <div>
            <h3 className="text-lg font-medium mb-4">
              Seleccionar Entradas
            </h3>
            <div className="space-y-3">
              {tickets.map((ticket) => (
                <div
                  key={ticket.name}
                  className="flex items-center justify-between p-4 border border-border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1">
                    <p className="font-medium">{ticket.name}</p>
                    <p className="text-sm text-muted-foreground">${ticket.price}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => updateQuantity(ticket.name, -1)}
                      className="w-8 h-8 border border-border hover:bg-foreground hover:text-background transition-colors flex items-center justify-center"
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

          {/* Form Fields */}
          {hasSelectedTickets && (
            <div>
              <h3 className="text-lg font-medium mb-4">
                Tus Datos
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Nombre Completo *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full p-3 border border-border bg-background focus:outline-none focus:border-foreground transition-colors"
                    placeholder="Tu nombre completo"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    className="w-full p-3 border border-border bg-background focus:outline-none focus:border-foreground transition-colors"
                    placeholder="tu@email.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Teléfono *
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                    className="w-full p-3 border border-border bg-background focus:outline-none focus:border-foreground transition-colors"
                    placeholder="099 123 456"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Bank Info */}
          {hasSelectedTickets && isFormValid && (
            <div className="p-4 bg-secondary/30 border border-border space-y-3">
              <h4 className="font-medium text-base">Datos para Transferencia</h4>
              <div className="text-sm space-y-1">
                <p className="font-medium">JOSE IGNACIO FANETTI PEDULLA</p>
                <p className="text-muted-foreground">Nro de cuenta 3895198000</p>
                <p className="text-muted-forvaeground">SANTANDER</p>
                <p className="text-muted-forvaeground">CAJA AHORRO PESOS</p>
              </div>
              <div className="mt-4 pt-3 border-t border-border/50">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <strong>Importante:</strong> Transfiere el monto total de <strong>${total}</strong> a la cuenta indicada. 
                  Si te equivocas con el monto, nos pondremos en contacto contigo: si es menor no enviaremos las entradas, 
                  y si es mayor devolveremos el dinero en un plazo de 90 dias. Por favor, intenta enviar el monto justo.
                </p>
              </div>
              <div className="mt-3 pt-3 border-t border-border/50">
                <p className="text-xs text-muted-foreground">
                  📎 <strong>No olvides adjuntar el comprobante de transferencia</strong> (foto o PDF) cuando envíes el mensaje de WhatsApp.
                </p>
              </div>
            </div>
          )}

          {/* Submit Button */}
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
              Recuerda adjuntar el comprobante de pago en WhatsApp
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default TicketPurchaseModal;