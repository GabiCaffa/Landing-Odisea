import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { CalendarDays, Flame, Instagram, MapPin, Ticket } from "lucide-react";
import Header from "@/components/Header";
import LoadingScreen from "@/components/LoadingScreen";
import { useAuth, formatEventDate } from "@/contexts/AuthContext";
import { imagenRedimensionada, srcSetRedimensionado } from "@/lib/imagenes";
import { promoVigente, textoVencimiento } from "@/lib/ticketPromos";
import { diasDelGrupo, etiquetaDeDia, eventoAgotado } from "@/lib/grupos";
import { useComisionTicketera, useSinTema } from "@/contexts/ThemeContext";
import { RUTA_APARTE, esFiestaAparte, fiestaAparte } from "@/lib/fiestasAparte";
import { precioConComision } from "@/lib/siteSettings";
import { stockDelLote, textoStockLote } from "@/lib/ticketTypes";
import { rastrear } from "@/lib/pixel";
import VisorFlyer from "@/components/VisorFlyer";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import { urlConsultaEvento } from "@/lib/consulta";
import { urlDeEvento } from "@/lib/rutas";

const CompraEntradas = lazy(() => import("@/components/CompraEntradas"));

/**
 * Página de un evento: `/evento/<slug>` (v25).
 *
 * **Existe para ponerla en un anuncio y para compartirla por WhatsApp.** Eso
 * manda tres cosas:
 *
 * - **Tiene que cargar aunque el evento sea de hace cinco minutos.** Lee de
 *   Supabase como todo el resto del sitio, así que una fecha recién creada en
 *   el panel ya tiene página. Lo único que espera al próximo deploy es el
 *   `og:image` del preview, que se hornea en un archivo HTML real porque
 *   WhatsApp no ejecuta JavaScript.
 * - **No puede parpadear "no existe".** Quien llega desde un anuncio pagado y
 *   ve ese cartel medio segundo, se va. Por eso se espera a `eventsLoaded` —la
 *   bandera de "la consulta ya volvió"— y no a que `events` tenga algo: con una
 *   lista vacía las dos situaciones se ven iguales.
 * - **El formulario de compra está puesto, no detrás de un botón.** Un modal
 *   encima de una página que YA es de este evento es un paso de más, y acá cada
 *   paso cuesta ventas. Es el mismo componente que usan los modales de la home
 *   (`CompraEntradas` con `modo="pagina"`), no una copia: el cálculo del total
 *   y el armado del mensaje no pueden vivir en dos lados.
 *
 * **Fiestas de varios días (v26):** si el evento está agrupado, arriba del
 * formulario aparece un selector de día. Cada día es un evento aparte con sus
 * entradas y su precio, así que elegir un día es **ir a su página** —un
 * `<Link>` de verdad, no un estado— y por eso el link se puede compartir, abrir
 * en otra pestaña y volver con el botón de atrás. La compra sigue siendo de un
 * día: quien va viernes y domingo hace dos compras, que es lo que pidió el
 * autor.
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
  const comisionTicketera = useComisionTicketera();
  // El flyer a tamaño grande, en la misma página (no en otra pestaña).
  const [flyerAbierto, setFlyerAbierto] = useState(false);

  // `/expofiesta` es la misma página sin el tramo del evento: la fiesta aparte
  // vigente. Se resuelve acá y no con un redirect para que la URL de los
  // anuncios no cambie y el tema se decida por la ruta, sin parpadeo.
  const { pathname } = useLocation();
  const enRutaAparte = pathname === RUTA_APARTE;
  const evento = useMemo(
    () => (enRutaAparte ? fiestaAparte(events) : events.find((e) => e.slug === slug)),
    [events, slug, enRutaAparte]
  );
  // Una fiesta aparte no lleva el tema estacional, entren por donde entren.
  useSinTema(!!evento && esFiestaAparte(evento));

  // Los días de la fiesta. Para un evento suelto es él solo, así que todo lo
  // de abajo funciona igual sin una sola rama extra.
  const dias = useMemo(
    () => (evento ? diasDelGrupo(events, evento) : []),
    [events, evento]
  );
  const enGrupo = dias.length > 1;
  // Para un grupo manda el nombre de la fiesta: es el que dice el anuncio por
  // el que llegó la persona. El del día va abajo del selector si es distinto.
  const titulo = (enGrupo && evento?.groupName) || evento?.name || "";

  useEffect(() => {
    if (!evento) return;
    const previo = document.title;
    document.title = `${titulo} · ${formatEventDate(evento.date)} · ODÍSEA`;
    return () => {
      document.title = previo;
    };
  }, [evento, titulo]);

  // Píxel de Meta: alguien miró esta fecha. Una vez por evento, cuando ya se
  // sabe cuál es (los datos llegan después de la ruta). Una fiesta aparte (Expo)
  // va también a su píxel; si se entró por /evento/<slug> y no por /expofiesta,
  // su PageView lo manda esto, porque la ruta sola no dice que es de la Expo.
  const eventoId = evento?.id;
  const esAparte = !!evento && esFiestaAparte(evento);
  useEffect(() => {
    if (!evento) return;
    const minimo = evento.tickets.filter((t) => t.active).map((t) => t.price);
    rastrear(
      "ViewContent",
      {
        content_name: titulo,
        content_ids: [evento.slug],
        content_type: "product",
        ...(minimo.length ? { value: Math.min(...minimo), currency: "UYU" } : {}),
      },
      esAparte ? "web+expo" : "web"
    );
    if (esAparte && !enRutaAparte) rastrear("PageView", undefined, "expo");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventoId]);

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
        </div>
    );
  }

  const entradas = evento.tickets.filter((t) => t.active);
  const promos = evento.promos.filter((p) => promoVigente(p));
  // Mismo criterio que la tarjeta del carrusel, para que no digan cosas
  // distintas: agotado si lo marcaron, si venció la venta o si no hay entradas.
  // Un evento de sólo consulta (v31) no vende entradas desde acá, y no es "agotado".
  const soloConsulta = !!evento.consultOnly;
  const agotado =
    !soloConsulta &&
    (evento.status === "agotado" ||
      entradas.length === 0 ||
      (evento.saleEndsAt ? new Date() >= new Date(evento.saleEndsAt) : false));

  // El tipo activo más barato, para el "desde $X" de arriba.
  const desde = entradas.length ? Math.min(...entradas.map((t) => t.price)) : 0;
  const desdeConComision = precioConComision(desde, comisionTicketera);
  // Cuántas quedan antes del cambio de lote (v29), si el staff lo cargó.
  const stockLote = agotado ? undefined : stockDelLote(entradas);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />

      <main className="flex-1 pt-[88px] md:pt-[92px]">
        <div className="mx-auto w-full max-w-6xl px-4 pb-2 sm:px-6 sm:pb-6">
          <div className="md:grid md:grid-cols-2 md:gap-10">
            {/* ── El flyer ─────────────────────────────────────────────── */}
            {/*
              **Capado al 45% de la pantalla en celular.** Un flyer vertical a
              ancho completo se comía la primera pantalla entera: medido, había
              que scrollear 845 px —más que el alto de la ventana— para ver un
              solo precio. Se sigue viendo completo, sólo que más chico, y
              tocarlo lo muestra grande en la misma página (`VisorFlyer`); antes
              abría la imagen en otra pestaña y sacaba a la persona de la compra.

              De `md:` para arriba no se capa, y además va `sticky`: la columna
              de la derecha mide el doble que ésta, así que sin esto quedaban
              520 px de vacío al bajar. Pegado, el flyer acompaña la compra.
            */}
            <button
              type="button"
              onClick={() => setFlyerAbierto(true)}
              className="relative float-left cursor-zoom-in mb-2 mr-3 block w-20 overflow-hidden rounded-xl sm:w-32 sm:rounded-2xl md:float-none md:m-0 md:w-fit md:max-w-full md:self-start md:sticky md:top-6"
              aria-label={`Ampliar el flyer de ${evento.name}`}
              // Inline y no `shadow-[var(...)]`: Tailwind no distingue si eso es una
              // sombra o un color y no genera nada (comprobado: `box-shadow: none`).
              style={{ boxShadow: "var(--shadow-lg)" }}
            >
              <img
                src={imagenRedimensionada(evento.image, 960)}
                srcSet={srcSetRedimensionado(evento.image) || undefined}
                sizes="(min-width: 768px) 480px, 100vw"
                alt={evento.name}
                className="block h-auto w-full md:w-auto md:max-w-full md:max-h-[72vh]"
                style={{
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
            </button>
            {flyerAbierto && (
              <VisorFlyer
                src={imagenRedimensionada(evento.image, 1600)}
                alt={evento.name}
                onClose={() => setFlyerAbierto(false)}
              />
            )}

            {/* ── La info y la compra ──────────────────────────────────── */}
            <div className="md:flex md:flex-col">
              <h1 className="font-sport text-xl font-black leading-[1.05] tracking-wide text-tinta sm:text-3xl md:text-4xl">
                {titulo}
              </h1>

              <div className="mt-1.5 space-y-0.5 sm:mt-3 sm:space-y-1">
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
                {!agotado && desde > 0 && (
                  // El precio arriba del pliegue: es lo que decide, y antes
                  // estaba a una pantalla de scroll de distancia.
                  <p className="flex items-center gap-2 text-sm">
                    <Ticket className="h-4 w-4 flex-shrink-0 text-celeste-deep" />
                    <span className="flex items-baseline gap-1.5 font-semibold uppercase tracking-wide">
                      {/* Tachado: lo que costaría en una ticketera, que le
                          suma su comisión. Ver COMISION_KEY en
                          src/lib/siteSettings.ts. */}
                      {desdeConComision > 0 && (
                        <span className="text-xs font-normal text-muted-foreground line-through tabular-nums">
                          ${desdeConComision.toLocaleString("es-UY")}
                        </span>
                      )}
                      <span>Desde ${desde.toLocaleString("es-UY")}</span>
                    </span>
                  </p>
                )}
                {stockLote !== undefined && (
                  <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-celeste-deep">
                    <Flame className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                    {textoStockLote(stockLote)}
                  </p>
                )}
                {evento.instagramUrl && (
                  <a
                    href={evento.instagramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground sm:text-sm"
                  >
                    <Instagram className="h-4 w-4 flex-shrink-0" />
                    <span className="underline underline-offset-2">Ver en Instagram</span>
                  </a>
                )}
              </div>

              {/* ── El día de la fiesta (v26) ──────────────────────────── */}
              {/*
                Va ARRIBA de las promos y de las entradas, y no es casual: lo
                que se elija acá cambia los precios, las promos y el cupo de
                todo lo que está debajo. Un selector puesto después sería
                pedirle a la persona que vuelva a leer lo que ya leyó.

                Son `<Link>` y no botones con estado: cada día es una página
                propia (v25), así que esto es navegar. Lo que se gana es que el
                día elegido se pueda compartir, abrir en otra pestaña y
                deshacer con el botón de atrás.
              */}
              {enGrupo && (
                <div className="clear-both mt-3 sm:mt-4">
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    ¿Qué día vas?
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {dias.map((d) => {
                      const { dia, fecha } = etiquetaDeDia(d.date);
                      const esteAgotado = eventoAgotado(d);
                      const activo = d.id === evento.id;
                      return (
                        <Link
                          key={d.id}
                          to={urlDeEvento(d.slug)}
                          aria-current={activo ? "page" : undefined}
                          className={`flex min-h-11 flex-col justify-center border px-3 py-1.5 text-center leading-tight transition-colors ${
                            activo
                              ? "border-celeste bg-celeste text-accent-foreground"
                              : "border-border hover:border-tinta/40"
                          }`}
                        >
                          <span className="text-[11px] font-bold uppercase tracking-wide">
                            {dia}
                          </span>
                          <span
                            className={`text-xs font-semibold uppercase ${
                              activo ? "" : "text-muted-foreground"
                            }`}
                          >
                            {fecha}
                          </span>
                          {/* El día agotado se muestra igual, apagado: sacarlo
                              deja a alguien buscando una fecha que vio en el
                              anuncio y no encuentra. */}
                          {esteAgotado && (
                            <span className="text-[10px] font-bold uppercase text-charrua">
                              Agotado
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                  {/* El nombre propio del día, si difiere del de la fiesta.
                      Tres días pueden tener line-ups distintos y ese dato no
                      está en ningún otro lado de la página. */}
                  {evento.name !== titulo && (
                    <p className="mt-1.5 text-xs font-semibold uppercase tracking-wide text-celeste-deep">
                      {evento.name}
                    </p>
                  )}
                </div>
              )}

              {/* ── Promos ─────────────────────────────────────────────── */}
              {!agotado && promos.length > 0 && (
                <div className="mt-5 space-y-2">
                  {/* Deduplicadas por nombre: el mismo "2x1" sobre General y
                      sobre VIP es un solo cartel. Sobre qué entrada aplica se
                      ve abajo, en cada entrada. */}
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

              {/* ── La compra, sin modal de por medio ──────────────────── */}
              <div className="clear-both mt-2 border-t border-border pt-2 sm:mt-4 sm:pt-4">
                {soloConsulta ? (
                  // Sin entradas ni precios: un solo botón que abre WhatsApp con la
                  // consulta escrita (nombre y fecha de la fiesta).
                  <div className="text-center">
                    <a
                      href={urlConsultaEvento(evento.name, formatEventDate(evento.date))}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() =>
                        rastrear(
                          "Lead",
                          { content_name: evento.name, content_ids: [evento.slug], content_category: "consulta" },
                          esAparte ? "web+expo" : "web"
                        )
                      }
                      className="btn-celeste flex min-h-[52px] w-full items-center justify-center gap-2 px-5 text-sm font-bold uppercase tracking-wide"
                    >
                      <WhatsAppIcon className="h-5 w-5" />
                      Consultar por WhatsApp
                    </a>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Escribinos y te respondemos por WhatsApp.
                    </p>
                  </div>
                ) : agotado ? (
                  <div className="border border-border p-4 text-center">
                    <p className="font-sport text-lg font-black uppercase tracking-wide">
                      Entradas agotadas
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Seguinos en Instagram para enterarte de las próximas fechas.
                    </p>
                  </div>
                ) : (
                  <Suspense
                    fallback={
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        Cargando entradas...
                      </p>
                    }
                  >
                    <CompraEntradas
                      modo="pagina"
                      eventId={evento.id}
                      eventName={evento.name}
                      eventDate={formatEventDate(evento.date)}
                      eventLocation={evento.location}
                      tickets={entradas}
                      promos={evento.promos}
                      diasDeLaFiesta={dias.length}
                    />
                  </Suspense>
                )}
              </div>

              {/* ── La descripción, DESPUÉS de las entradas ────────────── */}
              {/* Decisión del autor: primero el precio y el contador, después
                  el texto. Quien ya decidió comprar no tiene que pasar por
                  arriba de un párrafo; quien quiere leer, baja. */}
              {evento.description && (
                <p className="mt-6 whitespace-pre-line border-t border-border pt-6 text-sm leading-relaxed text-muted-foreground">
                  {evento.description}
                </p>
              )}
            </div>
          </div>

          <p className="clear-both mt-4 text-center text-[10px] text-muted-foreground">
            <Link to="/terminos" className="hover:text-foreground">
              Términos de Uso
            </Link>
            {" · "}
            <Link to="/privacidad" className="hover:text-foreground">
              Política de Privacidad
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
};

export default Evento;
