import { useState } from "react";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import TicketPurchaseModal from "./TicketPurchaseModal";

// ── Eventos disponibles (sincronizado con EventsSection) ──────────────────────
const EVENTS = [
  {
    name: "ODISEA NUEVA HELVECIA",
    date: "13 JUNIO 2026",
    location: "Club Artesano",
    tickets: [{ name: "general", price: 400 }],
  },
  {
    name: "ODISEA COLONIA",
    date: "20 JUNIO 2026",
    location: "Colonia Soho",
    tickets: [{ name: "general", price: 300 }],
  },
  {
    name: "ODISEA CARMELO",
    date: "20 JUNIO 2026",
    location: "Club Union Carmelo",
    tickets: [{ name: "general", price: 250 }],
  },
];

// ── Datos de las 3 promos ─────────────────────────────────────────────────────
const promos = [
  {
    number: "01",
    tag: "PROMO GRUPOS",
    title: "Vengan juntos,\nuno entra gratis.",
    description:
      "Comprá 5 entradas juntos y la sexta es nuestra. Coordiná con tu grupo y paguen en un solo pago para acceder al beneficio.",
    cta: "Consultar por WhatsApp",
    ctaHref:
      "https://wa.me/59892592179?text=Hola!%20Quiero%20info%20sobre%20la%20Promo%20Grupos",
  },
  {
    number: "02",
    tag: "PROMO CUMPLEAÑOS",
    title: "Tu cumple,\ntu fiesta.",
    description:
      "Si tu cumpleaños cae cerca de la fecha del evento, tenemos un beneficio especial para vos. Escribinos y coordinamos.",
    cta: "Consultar mi beneficio",
    ctaHref:
      "https://wa.me/59892592179?text=Hola!%20Quiero%20info%20sobre%20la%20Promo%20Cumplea%C3%B1os",
  },
  {
    number: "03",
    tag: "EXCLUSIVO WHATSAPP",
    title: "Precio DIrecto",
    description:
      "Comprá mediante nuestro canal de ventas y accedé al valor vigente de preventa. Atención personalizada, pago por transferencia y confirmación rápida.",
    cta: "Compra Directa",
    isModal: true, // ← abre el selector de evento + modal de compra
    highlight: true,
  },
];

// ── Sección principal ─────────────────────────────────────────────────────────
const PromosSection = () => {
  const { ref: headerRef, isVisible: headerVisible } = useScrollReveal({ threshold: 0.3 });

  // Estado del modal compartido entre la card 03 y el modal real
  const [selectedEvent, setSelectedEvent] = useState<(typeof EVENTS)[number] | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showEventPicker, setShowEventPicker] = useState(false);

  const openEventPicker = () => setShowEventPicker(true);

  const selectEvent = (event: (typeof EVENTS)[number]) => {
    setSelectedEvent(event);
    setShowEventPicker(false);
    setIsModalOpen(true);
  };

  return (
    <section id="promos" className="section-padding bg-background">
      <div className="container-odisea">
        {/* Header */}
        <div
          ref={headerRef}
          className={`text-center mb-12 md:mb-16 transition-all duration-700 ${
            headerVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground mb-3">
            Beneficios exclusivos
          </p>
          <h2 className="font-display text-4xl md:text-5xl lg:text-6xl tracking-wide mb-4">
            PROMOCIONES
          </h2>
          <div
            className={`w-16 h-0.5 bg-foreground mx-auto transition-all duration-500 delay-200 ${
              headerVisible ? "scale-x-100" : "scale-x-0"
            }`}
          />
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border">
          {promos.map((promo, index) => (
            <PromoCard
              key={promo.number}
              promo={promo}
              index={index}
              onOpenModal={openEventPicker}
            />
          ))}
        </div>

        {/* Bottom CTA */}
        <BottomCta />
      </div>

      {/* Event picker overlay */}
      {showEventPicker && (
        <EventPickerOverlay
          events={EVENTS}
          onSelect={selectEvent}
          onClose={() => setShowEventPicker(false)}
        />
      )}

      {/* Ticket modal reutilizado */}
      {selectedEvent && (
        <TicketPurchaseModal
          isOpen={isModalOpen}
          onClose={() => { setIsModalOpen(false); setSelectedEvent(null); }}
          eventName={selectedEvent.name}
          eventDate={selectedEvent.date}
          eventLocation={selectedEvent.location}
          tickets={selectedEvent.tickets}
        />
      )}
    </section>
  );
};

// ── Selector de evento ────────────────────────────────────────────────────────
const EventPickerOverlay = ({
  events,
  onSelect,
  onClose,
}: {
  events: typeof EVENTS;
  onSelect: (e: (typeof EVENTS)[number]) => void;
  onClose: () => void;
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
    <div className="relative w-full max-w-md bg-background border border-border">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-border">
        <div>
          <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-1">
            Exclusivo WhatsApp
          </p>
          <h2 className="text-xl font-semibold">¿Para qué evento?</h2>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-muted transition-colors"
          aria-label="Cerrar"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Event list */}
      <div className="p-4 space-y-2">
        {events.map((event) => (
          <button
            key={event.name}
            onClick={() => onSelect(event)}
            className="w-full text-left p-4 border border-border hover:bg-foreground hover:text-background transition-all duration-200 group"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold tracking-wide">{event.name}</p>
                <p className="text-sm text-muted-foreground group-hover:text-background/60 mt-0.5">
                  {event.date} · {event.location}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold">${event.tickets[0].price}</p>
                <p className="text-xs text-muted-foreground group-hover:text-background/60">
                  por entrada
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>

      <p className="px-6 pb-5 text-xs text-muted-foreground text-center">
        Precio sin comisión de ticketera · Pago por transferencia
      </p>
    </div>
  </div>
);

// ── Card individual ───────────────────────────────────────────────────────────
const PromoCard = ({
  promo,
  index,
  onOpenModal,
}: {
  promo: (typeof promos)[number];
  index: number;
  onOpenModal: () => void;
}) => {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.15 });

  return (
    <div
      ref={ref}
      className={`relative p-8 md:p-10 flex flex-col gap-6 group transition-all duration-700 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
      } ${promo.highlight ? "bg-foreground text-background" : "bg-background"}`}
      style={{ transitionDelay: `${index * 120}ms` }}
    >
      {/* Número watermark */}
      <span
        className={`absolute top-6 right-8 font-display text-7xl leading-none select-none pointer-events-none transition-opacity duration-300 ${
          promo.highlight
            ? "text-background/10 group-hover:text-background/20"
            : "text-foreground/5 group-hover:text-foreground/10"
        }`}
      >
        {promo.number}
      </span>

      {/* Icono + tag */}
      <div className="flex items-center gap-3">
        <div className={`p-2 border ${promo.highlight ? "border-background/30" : "border-border"}`}>
          <span className={promo.highlight ? "text-background" : "text-foreground"}>
          </span>
        </div>
        <span
          className={`text-xs tracking-[0.25em] uppercase font-medium ${
            promo.highlight ? "text-background/60" : "text-muted-foreground"
          }`}
        >
          {promo.tag}
        </span>
      </div>

      {/* Título */}
      <h3
        className={`font-display text-3xl md:text-4xl tracking-wide leading-tight whitespace-pre-line ${
          promo.highlight ? "text-background" : "text-foreground"
        }`}
      >
        {promo.title}
      </h3>

      {/* Descripción */}
      <p
        className={`text-sm leading-relaxed flex-1 ${
          promo.highlight ? "text-background/70" : "text-muted-foreground"
        }`}
      >
        {promo.description}
      </p>

      {/* CTA — botón si es modal, link si es WhatsApp directo */}
      {"isModal" in promo && promo.isModal ? (
        <button
          onClick={onOpenModal}
          className={`inline-flex items-center gap-2 text-sm tracking-wide uppercase border px-5 py-3 transition-all duration-300 w-fit cursor-pointer ${
            promo.highlight
              ? "border-background text-background hover:bg-background hover:text-foreground"
              : "border-foreground text-foreground hover:bg-foreground hover:text-background"
          }`}
        >
          {promo.cta}
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      ) : (
        <a
          href={"ctaHref" in promo ? promo.ctaHref : "#"}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-2 text-sm tracking-wide uppercase border px-5 py-3 transition-all duration-300 w-fit ${
            promo.highlight
              ? "border-background text-background hover:bg-background hover:text-foreground"
              : "border-foreground text-foreground hover:bg-foreground hover:text-background"
          }`}
        >
          {promo.cta}
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          </svg>
        </a>
      )}
    </div>
  );
};

// ── Strip inferior ────────────────────────────────────────────────────────────
const BottomCta = () => {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.3 });

  return (
    <div
      ref={ref}
      className={`mt-px bg-secondary/40 border border-border p-8 md:p-10 flex flex-col md:flex-row items-center justify-between gap-6 transition-all duration-700 delay-300 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      }`}
    >
      <div>
        <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-1">
          ¿Tenés dudas?
        </p>
        <p className="font-display text-2xl md:text-3xl tracking-wide">HABLÁ CON NOSOTROS</p>
      </div>
      <a
        href="https://wa.me/59892592179"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-3 bg-foreground text-background px-7 py-4 text-sm tracking-widest uppercase hover:bg-foreground/80 transition-colors duration-300 whitespace-nowrap"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
          <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.523 5.85L.057 23.215a.75.75 0 00.92.92l5.365-1.466A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.907 0-3.693-.504-5.23-1.385l-.374-.217-3.882 1.06 1.06-3.882-.217-.374A9.963 9.963 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
        </svg>
        WhatsApp
      </a>
    </div>
  );
};

export default PromosSection;
