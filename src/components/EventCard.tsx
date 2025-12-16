import { Instagram } from "lucide-react";
import whatsappLogo from "@/assets/whatsapp-logo.png";

interface EventCardProps {
  image: string;
  name: string;
  date: string;
  location: string;
  description: string;
  instagramUrl?: string;
}

const EventCard = ({
  image,
  name,
  date,
  location,
  description,
  instagramUrl,
}: EventCardProps) => {
  // Generate WhatsApp message for this specific event
  const generateWhatsAppMessage = () => {
    const message = `Buenas! Quiero comprar entradas para ${name} en ${location} el ${date}.`;
    return `https://wa.me/59891816716?text=${encodeURIComponent(message)}`;
  };

  return (
    <article className="card-techno overflow-hidden flex flex-col h-full w-[280px] md:w-[320px] transition-transform duration-300 hover:scale-105 hover:z-10">
      {/* Event Image */}
      <div className="relative aspect-[4/3] overflow-hidden">
        <img
          src={image}
          alt={name}
          className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
        />
        {/* Date overlay */}
        <div className="absolute top-4 left-4 bg-background/95 backdrop-blur-sm px-3 py-1.5">
          <span className="text-xs tracking-wider uppercase">
            {date}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 p-4">
        {/* Event name */}
        <h3 className="text-xl md:text-2xl tracking-wide mb-2">
          {name}
        </h3>

        {/* Location */}
        <div className="flex items-center gap-2 text-muted-foreground mb-4">
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <span className="text-sm">{location}</span>
        </div>

        {/* Description */}
        <p className="text-xs text-muted-foreground leading-relaxed flex-1 mb-4 line-clamp-3">
          {description}
        </p>

        {/* Buttons - Always aligned at bottom */}
        <div className="flex gap-2 mt-auto">
          <a
            href={generateWhatsAppMessage()}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-techno flex-1 text-xs py-2 px-3"
          >
            <img src={whatsappLogo} alt="WhatsApp" className="w-4 h-4" />
            <span>Comprar</span>
          </a>

          {instagramUrl && (
            <a
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-techno-outline flex-shrink-0 text-xs py-2 px-3"
              aria-label="Ver en Instagram"
            >
              <Instagram className="w-4 h-4" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
};

export default EventCard;