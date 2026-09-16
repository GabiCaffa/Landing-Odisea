import { useState, lazy, Suspense } from "react";
import { Instagram } from "lucide-react";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import { playHover, playThud } from "@/lib/spookySound";
import { imagenRedimensionada, srcSetRedimensionado, PROPORCION_EVENTO } from "@/lib/imagenes";
import { ImageTransform, DEFAULT_IMAGE_TRANSFORM } from "@/contexts/AuthContext";
import { EventTicket } from "@/lib/ticketTypes";
import { EventPromo, promoVigente } from "@/lib/ticketPromos";

// Carga diferida: el modal arrastra libphonenumber-js (~145KB) + PhoneInput.
// Así no entran al bundle inicial de la home; se cargan recién al tocar "Comprar".
const TicketPurchaseModal = lazy(() => import("./TicketPurchaseModal"));

interface EventCardProps {
  id?: string;
  image: string;
  imagePosition?: ImageTransform;
  name: string;
  date: string;
  location: string;
  description: string;
  instagramUrl?: string;
  tickets: EventTicket[];
  /** Promos de entrada del evento (v21). Vacío = sin promos. */
  promos?: EventPromo[];
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
  promos = [],
  soldOut,
  saleEndsAt,
}: EventCardProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const pos = imagePosition ?? DEFAULT_IMAGE_TRANSFORM;

  // Agotado si el admin lo marcó así, si ya pasó la fecha/hora de cierre de
  // venta, o si el evento no tiene ningún tipo de entrada a la venta.
  const isSoldOut =
    soldOut || tickets.length === 0 || (saleEndsAt ? new Date() >= new Date(saleEndsAt) : false);

  return (
    <>
      <article
        onMouseEnter={playHover}
        className="evento-card card-techno overflow-hidden flex flex-col h-full w-[280px] md:w-[320px]"
      >
        {/* Event Image */}
        <div className="evento-media relative aspect-[4/3] bg-papel overflow-hidden border-b border-border">
          <img
            // El original pesa hasta 533 KB para mostrarse a 318 px: se pide
            // redimensionado a Supabase, que además devuelve WebP.
            src={imagenRedimensionada(image, 640)}
            srcSet={srcSetRedimensionado(image) || undefined}
            // La tarjeta mide 280 px en celular y 320 en escritorio: con esto
            // el navegador baja la variante que corresponde a su pantalla en
            // vez de la más grande.
            sizes="(min-width: 768px) 320px, 280px"
            alt={name}
            // width/height NO fijan el tamaño —de eso se encarga el CSS— sino
            // la proporción, para que el navegador reserve el espacio antes de
            // que llegue la foto. Sin esto la tarjeta salta al cargar.
            width={PROPORCION_EVENTO.width}
            height={PROPORCION_EVENTO.height}
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
          <div className="evento-fecha absolute top-3 left-3 z-[2] bg-celeste text-accent-foreground px-3 py-1.5 rounded-full shadow-sm">
            <span className="text-xs font-semibold tracking-[0.12em] uppercase">{date}</span>
          </div>

          {/*
            Promos vigentes del evento, arriba a la derecha (la fecha ocupa la
            izquierda). Se muestran acá y no sólo dentro del modal porque es lo
            que hace que alguien lo abra: una promo escondida detrás de un click
            no vende nada.

            Se deduplican por nombre: si el mismo "2x1" está cargado sobre
            General y sobre VIP, en la card es un cartel solo — el detalle de
            sobre qué entrada aplica se ve al comprar. Y no se muestran si está
            agotado, que ahí el velo tapa todo igual.
          */}
          {!isSoldOut &&
            [...new Set(promos.filter((p) => promoVigente(p)).map((p) => p.name))]
              .slice(0, 2)
              .map((nombre, i) => (
                <div
                  key={nombre}
                  className="evento-promo absolute right-3 z-[2] rounded-full bg-celeste px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-accent-foreground shadow-sm"
                  style={{ top: `${0.75 + i * 2}rem` }}
                >
                  {nombre}
                </div>
              ))}

          {isSoldOut && (
            <div // --velo y no --tinta: el velo tiene que oscurecer la foto SIEMPRE, y
            // con el tema oscuro "tinta" es el hueso, así que la aclaraba.
            className="absolute inset-0 z-[2] bg-velo/70 backdrop-blur-[1px] flex items-center justify-center">
              <span className="evento-agotado title-display text-4xl md:text-5xl text-white bg-charrua rounded-lg px-5 py-1.5 -rotate-6 shadow-[var(--shadow-lg)]">
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
              onClick={() => {
                // En celular no hay hover: si el sonido no está también acá,
                // desde un teléfono el sitio es mudo.
                playThud();
                setIsModalOpen(true);
              }}
              disabled={isSoldOut}
              className="btn-techno flex-1 text-xs py-2.5 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <WhatsAppIcon className="w-4 h-4" />
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
            promos={promos}
          />
        </Suspense>
      )}
    </>
  );
};

export default EventCard;
