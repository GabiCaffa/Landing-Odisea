import { useMemo, useState, lazy, Suspense } from "react";
import { Cake, ChevronRight, Users, Zap, type LucideIcon } from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { useAuth, formatEventDate } from "@/contexts/AuthContext";
// Diferido, igual que en EventCard: arrastra PhoneInput -> libphonenumber.
// Estaba importado directo acá, y por eso esos ~35 KB seguían entrando en la
// carga inicial de la home aunque EventCard ya lo tuviera diferido.
const CompraEntradas = lazy(() => import("./CompraEntradas"));
// Diferido: arrastra PhoneInput -> libphonenumber (~35 KB comprimido) y sólo
// hace falta si alguien abre la promo de cumpleaños.
const BirthdayPromoModal = lazy(() => import("./BirthdayPromoModal"));
import { EventTicket } from "@/lib/ticketTypes";
import { EventPromo } from "@/lib/ticketPromos";
import { playThud } from "@/lib/spookySound";
import { useComisionTicketera } from "@/contexts/ThemeContext";
import { precioConComision } from "@/lib/siteSettings";
import ModalShell from "./ModalShell";
import WhatsAppIcon from "./WhatsAppIcon";

// Evento que consume el selector / modal de compra (derivado de los eventos reales).
type PickerEvent = {
  id: string;
  name: string;
  date: string;
  location: string;
  tickets: EventTicket[];
  /** Promos de entrada del evento (v21). */
  promos: EventPromo[];
};

// ── Datos de las 3 promos ─────────────────────────────────────────────────────
/**
 * El orden es el de lo que más vende: primero la compra directa, que es la
 * única que cierra una venta en el momento; después la de cumpleaños y por
 * último la de grupos, que es una consulta. Antes iban numeradas 01-02-03 en el
 * orden en que se fueron agregando.
 *
 * Los textos son cortos a propósito: se leen en un vistazo desde el celular.
 */
type Promo = {
  id: string;
  icon: LucideIcon;
  tag: string;
  title: string;
  description: string;
  cta: string;
  /** Si abre un modal del sitio. Sin esto es un link (`ctaHref`). */
  modal?: "birthday" | "tickets";
  ctaHref?: string;
  highlight?: boolean;
};

const promos: Promo[] = [
  {
    id: "directo",
    icon: Zap,
    tag: "Exclusivo WhatsApp",
    title: "Precio directo",
    description:
      "Comprá por nuestro canal de ventas al valor vigente de preventa. Pagás por transferencia y te confirmamos rápido.",
    cta: "Comprar directo",
    modal: "tickets", // ← abre el selector de evento + modal de compra
    highlight: true,
  },
  {
    id: "cumple",
    icon: Cake,
    tag: "Promo cumpleaños",
    title: "Tu cumple, tu fiesta",
    description:
      "Si tu cumpleaños cae cerca del evento tenés un beneficio especial. Reclamalo desde tu cuenta.",
    cta: "Reclamar beneficio",
    modal: "birthday", // ← abre el modal de la promo de cumpleaños
  },
  {
    id: "grupos",
    icon: Users,
    tag: "Promo grupos",
    title: "Vengan juntos",
    description:
      "Coordiná con tu grupo y paguen en un solo pago para acceder al beneficio.",
    cta: "Consultar",
    ctaHref:
      "https://wa.me/59892592179?text=Hola!%20Quiero%20info%20sobre%20la%20Promo%20Grupos",
  },
];

// ── Sección principal ─────────────────────────────────────────────────────────
const PromosSection = () => {
  const { ref: headerRef, isVisible: headerVisible } = useScrollReveal({ threshold: 0.3 });
  const { events } = useAuth();

  // Eventos comprables vía "Precio Directo": los activos (no agotados/finalizados),
  // tomados de la base y ordenados por fecha. Reemplaza la lista estática vieja.
  const purchasableEvents = useMemo<PickerEvent[]>(
    () =>
      events
        // Sin tipos de entrada a la venta no hay nada que comprar: no se ofrece.
        .filter((e) => e.status === "activo" && !e.consultOnly && e.tickets.some((t) => t.active))
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((e) => ({
          id: e.id,
          name: e.name,
          date: formatEventDate(e.date),
          location: e.location,
          tickets: e.tickets.filter((t) => t.active),
          promos: e.promos,
        })),
    [events]
  );

  // Estado del modal compartido entre la card 03 y el modal real
  const [selectedEvent, setSelectedEvent] = useState<PickerEvent | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showEventPicker, setShowEventPicker] = useState(false);
  const [showBirthday, setShowBirthday] = useState(false);

  const openPromoModal = (promo: Promo) => {
    if (promo.modal === "birthday") setShowBirthday(true);
    else setShowEventPicker(true);
  };

  const selectEvent = (event: PickerEvent) => {
    setSelectedEvent(event);
    setShowEventPicker(false);
    setIsModalOpen(true);
  };

  return (
    // Padding propio y más chico que `section-padding`: esta sección es de
    // consulta rápida, no de lectura, y a este alto se llega sin recorrer
    // pantallas de aire.
    // `scroll-mt-20`: el header es `fixed` (69 px en celular) y sin esto el título
    // queda tapado cuando se llega desde "Ver promociones".
    <section id="promos" className="scroll-mt-20 bg-papel py-8 md:py-12">
      <div className="container-odisea">
        {/* Header */}
        <div
          ref={headerRef}
          className={`mb-5 text-center transition-all duration-500 md:mb-7 ${
            headerVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <p className="eyebrow mb-2">Beneficios</p>
          <h2 className="title-sport text-4xl text-tinta sm:text-5xl md:text-6xl">
            <span className="highlight-celeste">PROMOCIONES</span>
          </h2>
        </div>

        {/* Una promo por fila en celular, tres en una fila desde `md:` */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
          {promos.map((promo) => (
            <PromoCard
              key={promo.id}
              promo={promo}
              onOpenModal={() => openPromoModal(promo)}
            />
          ))}
        </div>

        {/* Bottom CTA */}
        <BottomCta />
      </div>

      {/* Event picker overlay */}
      {showEventPicker && (
        <EventPickerOverlay
          events={purchasableEvents}
          onSelect={selectEvent}
          onClose={() => setShowEventPicker(false)}
        />
      )}

      {/* Promo cumpleaños: la solicitud se carga desde el sitio, sólo con cuenta */}
      {showBirthday && (
        <Suspense fallback={null}>
          <BirthdayPromoModal isOpen onClose={() => setShowBirthday(false)} />
        </Suspense>
      )}

      {/* Ticket modal reutilizado */}
      {selectedEvent && (
        <Suspense fallback={null}>
        <CompraEntradas
          isOpen={isModalOpen}
          onClose={() => { setIsModalOpen(false); setSelectedEvent(null); }}
          eventId={selectedEvent.id}
          eventName={selectedEvent.name}
          eventDate={selectedEvent.date}
          eventLocation={selectedEvent.location}
          tickets={selectedEvent.tickets}
          promos={selectedEvent.promos}
        />
        </Suspense>
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
  events: PickerEvent[];
  onSelect: (e: PickerEvent) => void;
  onClose: () => void;
}) => {
  const comisionTicketera = useComisionTicketera();

  return (
  <ModalShell onClose={onClose} ancho="md" etiqueta="Elegir el evento">
    {/* Encabezado fijo */}
    <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-border p-4 sm:p-6">
      <div className="min-w-0">
        <p className="mb-1 text-xs uppercase tracking-[0.25em] text-muted-foreground">
          Exclusivo WhatsApp
        </p>
        <h2 className="text-xl font-semibold">¿Para qué evento?</h2>
      </div>
      <button
        onClick={onClose}
        className="-mr-2 flex h-11 w-11 flex-shrink-0 items-center justify-center transition-colors hover:bg-muted"
        aria-label="Cerrar"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    {/* Lista de eventos — lo único que scrollea */}
    <div className="flex-1 space-y-2 overflow-y-auto p-4">
      {events.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No hay eventos disponibles en este momento.
        </p>
      )}
      {events.map((event) => (
        <button
          key={event.name}
          onClick={() => onSelect(event)}
          className="group w-full border border-border p-4 text-left transition-all duration-200 hover:bg-foreground hover:text-background"
        >
          {/* En celular el precio baja debajo del nombre: en una sola fila,
              un nombre largo se estrujaba contra la columna del precio. */}
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-semibold tracking-wide">{event.name}</p>
              <p className="mt-0.5 text-sm text-muted-foreground group-hover:text-background/60">
                {event.date} · {event.location}
              </p>
            </div>
            <div className="flex items-baseline gap-1.5 sm:block sm:flex-shrink-0 sm:text-right">
              {/* Tachado, igual que en la compra: lo que costaría en una
                  ticketera. Donde se muestre un precio se muestra el de
                  comparación. Ver COMISION_KEY en src/lib/siteSettings.ts. */}
              <p className="flex items-baseline justify-end gap-1.5">
                {precioConComision(event.tickets[0].price, comisionTicketera) > 0 && (
                  <span className="text-xs text-muted-foreground line-through tabular-nums group-hover:text-background/60">
                    ${precioConComision(event.tickets[0].price, comisionTicketera)}
                  </span>
                )}
                <span className="font-semibold">${event.tickets[0].price}</span>
              </p>
              <p className="text-xs text-muted-foreground group-hover:text-background/60">
                por entrada
              </p>
            </div>
          </div>
        </button>
      ))}
    </div>

    <p
      className="flex-shrink-0 px-6 pb-5 pt-1 text-center text-xs text-muted-foreground"
      style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
    >
      Precio sin comisión de ticketera · Pago por transferencia
    </p>
  </ModalShell>
  );
};

// ── Card individual ───────────────────────────────────────────────────────────
/**
 * Toda la tarjeta es la acción: un solo toque, sin tener que apuntarle a un
 * botón chico. El botón de la derecha es la flecha que dice "esto se toca", y
 * mide 44 px.
 *
 * Es un `<button>` si abre un modal del sitio y un `<a>` si va a WhatsApp, pero
 * por dentro son iguales, así que comparten el contenido y las clases.
 */
const PromoCard = ({
  promo,
  onOpenModal,
}: {
  promo: Promo;
  onOpenModal: () => void;
}) => {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.15 });
  const Icon = promo.icon;

  // `promo-card` y `promo-card--destacada` son los ganchos del tema estacional
  // (src/index.css): se enganchan de clases propias y no de utilidades.
  const clases = `promo-card ${promo.highlight ? "promo-card--destacada" : ""} group flex h-full w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition-all duration-300 active:scale-[0.99] md:flex-col md:items-start md:gap-3 md:p-5 ${
    promo.highlight
      ? "border-celeste bg-celeste text-accent-foreground shadow-[var(--shadow-md)]"
      : "border-border bg-card hover:border-tinta/30 hover:shadow-[var(--shadow-md)]"
  }`;

  const contenido = (
    <>
      <span
        className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${
          promo.highlight ? "bg-tinta/10" : "bg-celeste/10 text-celeste-deep"
        }`}
        aria-hidden="true"
      >
        <Icon className="h-6 w-6" />
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={`block text-[10px] font-semibold uppercase tracking-[0.2em] ${
            promo.highlight ? "text-accent-foreground/70" : "text-muted-foreground"
          }`}
        >
          {promo.tag}
        </span>
        <span className="block font-sport text-xl font-black uppercase leading-tight tracking-wide text-tinta md:text-2xl">
          {promo.title}
        </span>
        <span
          className={`mt-1 block text-xs leading-snug md:text-sm ${
            promo.highlight ? "text-accent-foreground/80" : "text-muted-foreground"
          }`}
        >
          {promo.description}
        </span>
      </span>

      <span
        className={`flex min-h-[44px] flex-shrink-0 items-center justify-center gap-1 rounded-full text-xs font-bold uppercase tracking-wide transition-all md:w-full ${
          promo.highlight
            ? "bg-tinta px-3 text-papel group-hover:bg-tinta/85 md:px-4"
            : "bg-tinta px-3 text-papel group-hover:bg-celeste group-hover:text-accent-foreground md:px-4"
        }`}
      >
        <span className="hidden md:inline">{promo.cta}</span>
        <ChevronRight className="h-5 w-5 md:h-4 md:w-4" aria-hidden="true" />
      </span>
    </>
  );

  return (
    <div
      ref={ref}
      className={`h-full transition-all duration-500 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      }`}
    >
      {promo.modal ? (
        <button
          type="button"
          onClick={() => {
            playThud();
            onOpenModal();
          }}
          aria-label={`${promo.title}: ${promo.cta}`}
          className={clases}
        >
          {contenido}
        </button>
      ) : (
        <a
          href={promo.ctaHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${promo.title}: ${promo.cta}`}
          className={clases}
        >
          {contenido}
        </a>
      )}
    </div>
  );
};

// ── Strip inferior ────────────────────────────────────────────────────────────
/**
 * Una fila angosta, no un bloque de pantalla: eran ~250 px de "HABLÁ CON
 * NOSOTROS" en 5xl para algo que es un enlace a WhatsApp.
 */
const BottomCta = () => (
  <div className="bloque-invertido mt-3 flex items-center justify-between gap-3 rounded-2xl bg-tinta px-4 py-3 text-papel md:mt-4 md:px-6">
    <p className="text-sm font-semibold md:text-base">¿Tenés dudas? Escribinos.</p>
    <a
      href="https://wa.me/59892592179"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-[44px] flex-shrink-0 items-center gap-2 rounded-full bg-celeste px-5 text-sm font-semibold tracking-wide text-accent-foreground transition-all hover:bg-celeste-deep active:scale-[0.98]"
    >
      <WhatsAppIcon className="h-4 w-4" />
      WhatsApp
    </a>
  </div>
);

export default PromosSection;
