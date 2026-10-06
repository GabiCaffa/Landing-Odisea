import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Flame, Instagram } from "lucide-react";
import { playHover, playThud } from "@/lib/spookySound";
import { imagenRedimensionada, srcSetRedimensionado, PROPORCION_EVENTO } from "@/lib/imagenes";
import { ImageTransform, DEFAULT_IMAGE_TRANSFORM } from "@/contexts/AuthContext";
import { EventTicket, stockDelLote, textoStockLote } from "@/lib/ticketTypes";
import { EventPromo, promoVigente } from "@/lib/ticketPromos";
import { urlDeEvento } from "@/lib/rutas";
import { useCartelEventos } from "@/contexts/ThemeContext";

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
  /**
   * Cuántos días tiene la fiesta (v26). 1 o ausente = evento suelto.
   *
   * Cambia sólo la pista de abajo: con varios días lo que se elige adentro no
   * es cuántas entradas sino **qué día**, y conviene decirlo antes de entrar.
   */
  dias?: number;
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
  dias = 1,
}: EventCardProps) => {
  const pos = imagePosition ?? DEFAULT_IMAGE_TRANSFORM;
  const destino = slug ? urlDeEvento(slug) : null;
  const cartel = useCartelEventos();

  // Agotado si el admin lo marcó así, si ya pasó la fecha/hora de cierre de
  // venta, o si el evento no tiene ningún tipo de entrada a la venta.
  const isSoldOut =
    soldOut || tickets.length === 0 || (saleEndsAt ? new Date() >= new Date(saleEndsAt) : false);

  const stock = isSoldOut ? undefined : stockDelLote(tickets);

  // Los carteles de promo (2x1, etc.), sin repetir y de a tres como mucho. En
  // escritorio van sobre el flyer; en celular, donde el flyer es una miniatura,
  // pasan a una pastilla bajo el título.
  const etiquetas = isSoldOut
    ? []
    : [...new Set(promos.filter((p) => promoVigente(p)).map((p) => p.name))].slice(0, 3);

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
      className="evento-card card-techno relative grid h-full w-full grid-cols-[104px_minmax(0,1fr)] gap-x-3 gap-y-3 overflow-hidden p-3 sm:flex sm:flex-col sm:gap-0 sm:p-0"
    >
      <div className="evento-media relative aspect-[4/5] overflow-hidden rounded-xl bg-papel sm:aspect-[4/3] sm:rounded-none sm:border-b sm:border-border">
        <img
          // El original pesa hasta 533 KB para mostrarse a 318 px: se pide
          // redimensionado a Supabase, que además devuelve WebP.
          src={imagenRedimensionada(image, 640)}
          srcSet={srcSetRedimensionado(image) || undefined}
          // En celular el flyer es una miniatura de 104 px; desde `sm:` la
          // tarjeta mide 320. Con esto el navegador baja la variante que
          // corresponde en vez de la más grande.
          sizes="(min-width: 640px) 320px, 104px"
          alt={name}
          // width/height NO fijan el tamaño —de eso se encarga el CSS— sino
          // la proporción, para que el navegador reserve el espacio antes de
          // que llegue la foto. Sin esto la tarjeta salta al cargar.
          width={PROPORCION_EVENTO.width}
          height={PROPORCION_EVENTO.height}
          loading="lazy"
          decoding="async"
          // El encuadre del admin (ajuste, zoom y foco) está pensado para el 4:3
          // de escritorio. En la miniatura de celular (4:5) el zoom la recortaría
          // mal, así que ahí sólo se respeta el foco y la imagen llena el cuadro;
          // el resto vale desde `sm:`. Va por variables CSS porque un `style`
          // inline no puede depender del tamaño de pantalla.
          className="h-full w-full object-cover [object-position:var(--pos)] sm:[object-fit:var(--fit)] sm:[transform-origin:var(--pos)] sm:[transform:scale(var(--scale))]"
          style={
            {
              "--fit": pos.fit,
              "--pos": `${pos.x}% ${pos.y}%`,
              "--scale": pos.scale,
            } as CSSProperties
          }
        />
        <div className="evento-fecha absolute left-3 top-3 z-[2] hidden sm:block rounded-full bg-celeste px-3 py-1.5 text-accent-foreground shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-[0.12em]">{date}</span>
        </div>

        {/*
          Carteles de arriba a la derecha (la fecha ocupa la izquierda). Se
          muestran acá y no sólo dentro de la página porque es lo que hace que
          alguien entre: una oferta escondida detrás de un click no vende nada.
          Con el evento agotado no va ninguno, que ahí el velo tapa todo igual.

          Son DOS cosas distintas que se ven igual, y la diferencia importa:

          - El **cartel del sitio** (`cartel`, v19/site_settings) ya no es una
            pastilla: es el texto del botón de compra, de abajo. Es puro texto: NO descuenta. Lo que se vende ya tiene el descuento
            metido en el precio que se carga en el evento. Si esto fuera una
            promo de verdad, el sitio restaría el porcentaje otra vez.
          - Las **promos** (v21) sí calculan, y por eso salen de los datos del
            evento. Se deduplican por nombre: si el mismo "2x1" está cargado
            sobre General y sobre VIP, acá es uno solo — sobre qué entrada
            aplica se ve al comprar.

          Tres como mucho: a partir de ahí la pila tapa el flyer.
        */}
        {etiquetas.map((nombre, i) => (
          <div
            key={nombre}
            className="evento-promo absolute right-3 z-[2] hidden rounded-full bg-celeste px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-accent-foreground shadow-sm sm:block"
            style={{ top: `${0.75 + i * 2.25}rem` }}
          >
            {nombre}
          </div>
        ))}

        {isSoldOut && (
          <div // --velo y no --tinta: el velo tiene que oscurecer la foto SIEMPRE, y
          // con el tema oscuro "tinta" es el hueso, así que la aclaraba.
          className="absolute inset-0 z-[2] flex items-center justify-center bg-velo/70 backdrop-blur-[1px]">
            <span className="evento-agotado title-display -rotate-6 rounded-lg bg-charrua px-2 py-1 text-xl text-white shadow-[var(--shadow-lg)] sm:px-5 sm:py-1.5 sm:text-4xl md:text-5xl">
              AGOTADO
            </span>
          </div>
        )}
      </div>

      {/* En celular este contenedor no existe (`contents`): la grilla de arriba
          acomoda la miniatura, los datos y el botón de abajo. Desde `sm:` es la
          columna de siempre. */}
      <div className="contents sm:flex sm:flex-1 sm:flex-col sm:p-4">
        <div className="flex min-w-0 flex-col sm:flex-1">
        {/* La fecha, que desde `sm:` es la pastilla sobre el flyer. */}
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-celeste-deep sm:hidden">
          {date}
        </p>
        <h3 className="font-sport mb-1.5 line-clamp-3 text-xl font-black leading-[0.95] tracking-wide text-tinta sm:mb-2 sm:line-clamp-none sm:text-2xl md:text-3xl">
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

        <div className="font-sport mb-2 flex items-center gap-1.5 text-tinta/70 sm:mb-3 sm:gap-2">
          <svg className="h-4 w-4 text-celeste-deep" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-xs font-semibold uppercase tracking-wide sm:text-sm">{location}</span>
        </div>

        {/* La descripción sólo desde `sm:`: en celular es lo que más alto hace a
            la tarjeta y se lee en la página del evento. */}
        <p className="mb-4 hidden flex-1 text-xs leading-relaxed text-muted-foreground sm:line-clamp-3 sm:block">
          {description}
        </p>

        {/* Promos (2x1, etc.): pastilla bajo el título en celular. */}
        {etiquetas.length > 0 && (
          <span className="mb-2 inline-flex w-fit rounded-full bg-celeste px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-foreground sm:hidden">
            {etiquetas.join(" · ")}
          </span>
        )}

        {/*
          UN botón grande, que es lo que decide la venta desde un celular.

          **No lleva precio, a propósito**: el precio depende del lote vigente y
          cambia a mano en cada evento; mostrarlo acá sería un segundo lugar que
          mantener actualizado. Precios y lotes viven en la página del evento.
          **El texto del botón es el cartel del sitio** (`cartel_eventos`, p. ej.
          "15% OFF SOLO WEB"): se cambia desde el panel sin tocar código, y sin
          cartel el botón dice "Comprar entradas".

          **El botón no es un link nuevo**: es un <span> con cara de botón, y el
          click lo recibe el link del título (el `::after` que cubre la tarjeta).
          Así no hay dos llamadas a la acción distintas —que fue lo que se sacó
          en v25— sino una sola, ahora visible como lo que es. Antes quedaba una
          pista de texto chico ("VER Y COMPRAR →") que se confundía con
          decoración.

          Agotado: sin naranja y sin cartel; el botón pasa a contorno.
        */}
        {/*
          La urgencia REAL: cuántas entradas quedan antes del cambio de lote.
          Es un dato que carga el staff (v29) y se muestra tal cual, así que
          sólo aparece si hay un número cargado; sin él, no se inventa nada.
        */}
        {stock !== undefined && (
          <p className="mb-0 flex items-start gap-1.5 text-[11px] font-bold uppercase leading-tight tracking-wide text-celeste-deep sm:mb-3 sm:items-center sm:text-xs">
            <Flame className="h-4 w-4 flex-shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
            {textoStockLote(stock)}
          </p>
        )}

        </div>

        <div className="col-span-2 mt-auto flex items-stretch gap-2 sm:col-auto">
          <span
            className={`group flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm font-bold uppercase tracking-wide transition-all ${
              isSoldOut
                ? "border border-tinta/20 text-tinta"
                : "bg-celeste text-accent-foreground"
            }`}
          >
            {isSoldOut
              ? "Ver la fecha"
              : dias > 1
                ? `Elegí tu día (${dias})`
                : cartel
                  ? `Comprar · ${cartel}`
                  : "Comprar entradas"}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>

          {instagramUrl && (
            <a
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-techno-outline relative z-10 min-h-[44px] min-w-[44px] flex-shrink-0 px-3 text-xs"
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
