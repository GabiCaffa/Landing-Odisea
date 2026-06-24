import { useState, lazy, Suspense } from "react";
import { Instagram } from "lucide-react";
import whatsappLogo from "@/assets/whatsapp-logo.png";
import { ImageTransform, DEFAULT_IMAGE_TRANSFORM } from "@/contexts/AuthContext";

// Carga diferida: el modal arrastra libphonenumber-js (~145KB) + PhoneInput.
// Así no entran al bundle inicial de la home; se cargan recién al tocar "Comprar".
const TicketPurchaseModal = lazy(() => import("./TicketPurchaseModal"));

interface Ticket {
  name: string;
  price: number;
}

interface EventCardProps {
  id?: string;
  image: string;
  imagePosition?: ImageTransform;
  name: string;
  date: string;
  location: string;
  description: string;
  instagramUrl?: string;
  tickets: Ticket[];
  soldOut?: boolean;
  /** ISO datetime; pasado este momento la venta se cierra sola */
  saleEndsAt?: string;
}

const EventCard = ({
  id,
  image,
  imagePosition,
  name,
  date,
  location,
  description,
  instagramUrl,
  tickets,
  soldOut,
  saleEndsAt,
}: EventCardProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const pos = imagePosition ?? DEFAULT_IMAGE_TRANSFORM;

  // Agotado si el admin lo marcó así, o si ya pasó la fecha/hora de cierre de venta.
  const isSoldOut = soldOut || (saleEndsAt ? new Date() >= new Date(saleEndsAt) : false);

  return (
    <>
      <article className="card-techno overflow-hidden flex flex-col h-full w-[280px] md:w-[320px]">
        {/* Event Image */}
        <div className="relative aspect-[4/3] bg-papel overflow-hidden border-b border-border">
          <img
            src={image}
            alt={name}
            loading="lazy"
            decoding="async"
            className="w-full h-full"
            style={{
              objectFit: pos.fit,
              objectPosition: `${pos.x}% ${pos.y}%`,
              transform: `scale(${pos.scale})`,
              transformOrigin: `${pos.x}% ${pos.y}%`,
            }}
          />
          {/* Date badge estilo ticket */}
          <div className="absolute top-3 left-3 bg-celeste text-white px-3 py-1.5 rounded-full shadow-sm">
            <span className="text-xs font-semibold tracking-[0.12em] uppercase">{date}</span>
          </div>

          {isSoldOut && (
            <div className="absolute inset-0 bg-tinta/65 backdrop-blur-[1px] flex items-center justify-center">
              <span className="title-display text-4xl md:text-5xl text-white bg-charrua rounded-lg px-5 py-1.5 -rotate-6 shadow-[var(--shadow-lg)]">
                AGOTADO
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex flex-col flex-1 p-4">
          <h3 className="font-sport text-2xl md:text-3xl font-black tracking-wide leading-[0.95] mb-2 text-tinta">
            {name}
          </h3>

          <div className="flex items-center gap-2 text-tinta/70 mb-3 font-sport">
            <svg className="w-4 h-4 text-celeste-deep" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-sm font-semibold tracking-wide uppercase">{location}</span>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed flex-1 mb-4 line-clamp-3">
            {description}
          </p>

          <div className="flex gap-2 mt-auto">
            <button
              onClick={() => setIsModalOpen(true)}
              disabled={isSoldOut}
              className="btn-techno flex-1 text-xs py-2.5 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <img src={whatsappLogo} alt="WhatsApp" className="w-4 h-4" />
              <span>{isSoldOut ? "Agotado" : "Comprar"}</span>
            </button>

            {instagramUrl && (
              <a
                href={instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-techno-outline flex-shrink-0 text-xs py-2.5 px-3"
                aria-label="Ver en Instagram"
              >
                <Instagram className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>
      </article>

      {/* Purchase Modal — montado solo al abrirse (lazy) */}
      {isModalOpen && (
        <Suspense fallback={null}>
          <TicketPurchaseModal
            isOpen
            onClose={() => setIsModalOpen(false)}
            eventId={id}
            eventName={name}
            eventDate={date}
            eventLocation={location}
            tickets={tickets}
          />
        </Suspense>
      )}
    </>
  );
};

export default EventCard;
