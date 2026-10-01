import { Link } from "react-router-dom";
import { ArrowRight, Instagram } from "lucide-react";
import { playHover, playThud } from "@/lib/spookySound";
import { imagenRedimensionada, srcSetRedimensionado, PROPORCION_EVENTO } from "@/lib/imagenes";
import { ImageTransform, DEFAULT_IMAGE_TRANSFORM } from "@/contexts/AuthContext";
import { EventTicket } from "@/lib/ticketTypes";
import { EventPromo, promoVigente } from "@/lib/ticketPromos";
import { urlDeEvento } from "@/lib/rutas";

/**
 * Tarjeta de evento del carrusel de la home.
 *
 * **Ya no abre el modal de compra: lleva a la página del evento** (v25). La
 * compra sigue siendo el mismo modal de siempre, pero se abre allá. El motivo
 * es que esa página es la que se pone en un anuncio y la que se comparte por
 * WhatsApp, así que tiene que ser el destino real de todo lo que se toca acá —
 * si la tarjeta vendiera sin pasar por la página, la página quedaría como un
 * rincón que sólo ve el que llega de un anuncio.
 *
 * De paso, el modal dejó de estar en la cadena de la home: `TicketPurchaseModal`
 * arrastra libphonenumber-js, y ahora sólo lo cargan las secciones de promos y
 * la página del evento.
 */

interface EventCardProps {
  /** Tramo de URL del evento. Sin esto la tarjeta no linkea a ningún lado. */
  slug?: string;
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
  slug,
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
  const pos = imagePosition ?? DEFAULT_IMAGE_TRANSFORM;
  const destino = slug ? urlDeEvento(slug) : null;

  // Agotado si el admin lo marcó así, si ya pasó la fecha/hora de cierre de
  // venta, o si el evento no tiene ningún tipo de entrada a la venta.
  const isSoldOut =
    soldOut || tickets.length === 0 || (saleEndsAt ? new Date() >= new Date(saleEndsAt) : false);

  return (
    /*
     * `relative` porque acá adentro va un "stretched link": el <Link> del
     * título lleva un `::after` que cubre la tarjeta entera, así que se puede
     * tocar en cualquier parte.
     *
     * Se hace así y NO envolviendo todo en un <a> porque adentro hay otros dos
     * links (Comprar e Instagram) y **un <a> dentro de otro <a> es HTML
     * inválido**: el navegador rompe el árbol y el de adentro deja de
     * funcionar. Con este patrón los tres son hermanos; los dos de abajo van
     * en `z-10` para quedar por encima del `::after`.
     */
    <article
      onMouseEnter={playHover}
      className="evento-card card-techno relative flex h-full w-[280px] flex-col overflow-hidden md:w-[320px]"
    >
      <div className="evento-media relative aspect-[4/3] overflow-hidden border-b border-border bg-papel">
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
          className="h-full w-full"
          style={{
            objectFit: pos.fit,
            objectPosition: `${pos.x}% ${pos.y}%`,
            transform: `scale(${pos.scale})`,
            transformOrigin: `${pos.x}% ${pos.y}%`,
          }}
        />
        <div className="evento-fecha absolute left-3 top-3 z-[2] rounded-full bg-celeste px-3 py-1.5 text-accent-foreground shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-[0.12em]">{date}</span>
        </div>

        {/*
          Promos vigentes del evento, arriba a la derecha (la fecha ocupa la
          izquierda). Se muestran acá y no sólo dentro del modal porque es lo
          que hace que alguien entre: una promo escondida detrás de un click
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
          className="absolute inset-0 z-[2] flex items-center justify-center bg-velo/70 backdrop-blur-[1px]">
            <span className="evento-agotado title-display -rotate-6 rounded-lg bg-charrua px-5 py-1.5 text-4xl text-white shadow-[var(--shadow-lg)] md:text-5xl">
              AGOTADO
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-sport mb-2 text-2xl font-black leading-[0.95] tracking-wide text-tinta md:text-3xl">
          {destino ? (
            // El `after:` es el que hace clickeable la tarjeta entera.
            <Link
              to={destino}
              onClick={playThud}
              className="after:absolute after:inset-0 after:content-['']"
            >
              {name}
            </Link>
          ) : (
            name
          )}
        </h3>

        <div className="font-sport mb-3 flex items-center gap-2 text-tinta/70">
          <svg className="h-4 w-4 text-celeste-deep" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-sm font-semibold uppercase tracking-wide">{location}</span>
        </div>

        <p className="mb-4 line-clamp-3 flex-1 text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>

        {/*
          Sin botón de comprar.

          La tarjeta ENTERA es el link a la página del evento, así que un botón
          al lado era una segunda llamada a la acción compitiendo con ella y
          agregando ruido a una tarjeta que ya tiene flyer, fecha, lugar y
          promo. Queda sólo una pista de que se puede tocar —si no, nada dice
          que la tarjeta lleva a algún lado— y el acceso a Instagram, que va a
          otro destino y por eso sigue siendo un botón de verdad.
        */}
        <div className="mt-auto flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-celeste-deep">
            {isSoldOut ? "Ver la fecha" : "Ver y comprar"}
            <ArrowRight className="h-3.5 w-3.5" />
          </span>

          {instagramUrl && (
            <a
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-techno-outline relative z-10 flex-shrink-0 px-3 py-2.5 text-xs"
              aria-label="Ver en Instagram"
            >
              <Instagram className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
};

export default EventCard;
