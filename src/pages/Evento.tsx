import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, Instagram, MapPin, Ticket } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import LoadingScreen from "@/components/LoadingScreen";
import { useAuth, formatEventDate } from "@/contexts/AuthContext";
import { imagenRedimensionada, srcSetRedimensionado } from "@/lib/imagenes";
import { promoVigente, textoVencimiento } from "@/lib/ticketPromos";
import { playThud } from "@/lib/spookySound";

const TicketPurchaseModal = lazy(() => import("@/components/TicketPurchaseModal"));

/**
 * Página de un evento: `/evento/<slug>` (v25).
 *
 * **Existe para ponerla en un anuncio y para compartirla por WhatsApp.** Eso
 * manda dos cosas:
 *
 * - **Tiene que cargar aunque el evento sea de hace cinco minutos.** Lee de
 *   Supabase como todo el resto del sitio, así que una fecha recién creada en
 *   el panel ya tiene página. Lo único que espera al próximo deploy es el
 *   `og:image` del preview, que lo hornea `bakeEventos` en un archivo HTML real
 *   porque WhatsApp no ejecuta JavaScript.
 * - **No puede parpadear "no existe".** Quien llega desde un anuncio pagado y
 *   ve ese cartel medio segundo, se va. Por eso se espera a `eventsLoaded` —la
 *   bandera de "la consulta ya volvió"— y no a que `events` tenga algo: con una
 *   lista vacía las dos situaciones se ven iguales.
 *
 * El título del documento **sí** se toca acá, al revés que en la home (§6.8).
 * Allá había un `document.title` que pisaba el escrito para Google; acá no hay
 * ningún título por evento en el `index.html` que se pueda pisar, y el que
 * hornea el build vive en el archivo del evento. Se restaura al salir: si no,
 * volver a la home por el link de arriba deja el nombre de la fiesta en la
 * pestaña.
 */
const Evento = () => {
  const { slug } = useParams<{ slug: string }>();
  const { events, eventsLoaded } = useAuth();
  const [comprando, setComprando] = useState(false);

  const evento = useMemo(
    () => events.find((e) => e.slug === slug),
    [events, slug]
  );

  useEffect(() => {
    if (!evento) return;
    const previo = document.title;
    document.title = `${evento.name} · ${formatEventDate(evento.date)} · ODÍSEA`;
    return () => {
      document.title = previo;
    };
  }, [evento]);

  if (!eventsLoaded) return <LoadingScreen />;

  if (!evento) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Header />
        <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="title-sport text-3xl font-black tracking-wide">
            NO ENCONTRAMOS ESA FECHA
          </h1>
          <p className="max-w-md text-sm text-muted-foreground">
            Puede que ya haya pasado o que el link esté mal escrito. Mirá las próximas
            fechas en la página principal.
          </p>
          <Link to="/" className="btn-techno px-5 py-3 text-xs">
            Ver todas las fechas
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  const entradas = evento.tickets.filter((t) => t.active);
  const promos = evento.promos.filter((p) => promoVigente(p));
  // Mismo criterio que la tarjeta del carrusel, para que no digan cosas
  // distintas: agotado si lo marcaron, si venció la venta o si no hay entradas.
  const agotado =
    evento.status === "agotado" ||
    entradas.length === 0 ||
    (evento.saleEndsAt ? new Date() >= new Date(evento.saleEndsAt) : false);

  const desde = entradas.length ? Math.min(...entradas.map((t) => t.price)) : 0;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
          <Link
            to="/"
            className="mb-5 inline-flex min-h-11 items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Todas las fechas
          </Link>

          <div className="grid gap-6 md:grid-cols-2 md:gap-10">
            {/* ── El flyer ─────────────────────────────────────────────── */}
            <div className="relative overflow-hidden border border-border bg-papel">
              <img
                src={imagenRedimensionada(evento.image, 960)}
                srcSet={srcSetRedimensionado(evento.image) || undefined}
                sizes="(min-width: 768px) 480px, 100vw"
                alt={evento.name}
                className="w-full"
                style={{
                  objectFit: evento.imagePosition.fit,
                  objectPosition: `${evento.imagePosition.x}% ${evento.imagePosition.y}%`,
                }}
              />
              {agotado && (
                <div className="absolute inset-0 flex items-center justify-center bg-velo/70 backdrop-blur-[1px]">
                  <span className="title-display -rotate-6 rounded-lg bg-charrua px-6 py-2 text-4xl text-white shadow-[var(--shadow-lg)] md:text-5xl">
                    AGOTADO
                  </span>
                </div>
              )}
            </div>

            {/* ── La info ──────────────────────────────────────────────── */}
            <div className="flex flex-col">
              <h1 className="font-sport text-3xl font-black leading-[0.95] tracking-wide text-tinta sm:text-4xl md:text-5xl">
                {evento.name}
              </h1>

              <div className="mt-4 space-y-2">
                <p className="flex items-center gap-2 text-sm">
                  <CalendarDays className="h-4 w-4 flex-shrink-0 text-celeste-deep" />
                  <span className="font-semibold uppercase tracking-wide">
                    {formatEventDate(evento.date)}
                  </span>
                </p>
                <p className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 flex-shrink-0 text-celeste-deep" />
                  <span className="font-semibold uppercase tracking-wide">
                    {evento.location}
                  </span>
                </p>
              </div>

              {evento.description && (
                <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {evento.description}
                </p>
              )}

              {/* ── Promos ─────────────────────────────────────────────── */}
              {!agotado && promos.length > 0 && (
                <div className="mt-5 space-y-2">
                  {/* Deduplicadas por nombre: el mismo "2x1" sobre General y
                      sobre VIP es un solo cartel. Sobre qué entrada aplica se
                      ve al comprar, igual que en la tarjeta. */}
                  {[...new Map(promos.map((p) => [p.name, p])).values()].map((p) => (
                    <div
                      key={p.name}
                      className="border border-celeste bg-celeste/10 px-3 py-2"
                    >
                      <p className="text-sm font-bold uppercase tracking-wide text-celeste-deep">
                        {p.name}
                      </p>
                      {p.description && (
                        <p className="text-xs text-muted-foreground">{p.description}</p>
                      )}
                      {textoVencimiento(p.endsAt) && (
                        <p className="text-xs font-semibold text-charrua">
                          {textoVencimiento(p.endsAt)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* ── Entradas ───────────────────────────────────────────── */}
              {entradas.length > 0 && (
                <div className="mt-5 border border-border">
                  <p className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wider">
                    <Ticket className="h-3.5 w-3.5" /> Entradas
                  </p>
                  <ul className="divide-y divide-border">
                    {entradas.map((t) => (
                      <li key={t.ticketTypeId} className="px-3 py-2">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-sm font-semibold">{t.name}</span>
                          <span className="text-sm font-bold">
                            ${t.price.toLocaleString("es-UY")}
                          </span>
                        </div>
                        {t.description && (
                          <p className="text-xs text-muted-foreground">{t.description}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* ── Comprar ────────────────────────────────────────────── */}
              <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={() => {
                    playThud();
                    setComprando(true);
                  }}
                  disabled={agotado}
                  className="btn-techno min-h-12 flex-1 px-5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <WhatsAppIcon className="h-5 w-5" />
                  <span>
                    {agotado ? "Agotado" : `Comprar · desde $${desde.toLocaleString("es-UY")}`}
                  </span>
                </button>

                {evento.instagramUrl && (
                  <a
                    href={evento.instagramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-techno-outline inline-flex min-h-12 items-center justify-center gap-2 px-5 text-sm"
                  >
                    <Instagram className="h-5 w-5" />
                    <span className="sm:hidden">Ver en Instagram</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />

      {comprando && (
        <Suspense fallback={null}>
          <TicketPurchaseModal
            isOpen
            onClose={() => setComprando(false)}
            eventId={evento.id}
            eventName={evento.name}
            eventDate={formatEventDate(evento.date)}
            eventLocation={evento.location}
            tickets={entradas}
            promos={evento.promos}
          />
        </Suspense>
      )}
    </div>
  );
};

export default Evento;
