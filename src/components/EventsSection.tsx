import { useMemo } from "react";
import EventCard from "./EventCard";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { useAuth } from "@/contexts/AuthContext";
import { agruparEventos } from "@/lib/grupos";
import { RUTA_APARTE, esFiestaAparte } from "@/lib/fiestasAparte";
import SpookySpiders from "./SpookySpiders";

/**
 * Las próximas fechas, en un grid que se ve entero.
 *
 * Antes era un carrusel horizontal con flechas. Con pocas fechas —que es lo
 * normal— escondía las que no entraban: en un celular se veía UNA tarjeta y el
 * borde de la siguiente, y quien no deslizaba nunca se enteraba de que había
 * más. Ahora van todas, una debajo de la otra en celular y en filas centradas
 * de 320 px desde `sm:`. Cero gestos para ver qué hay, y cada tarjeta lleva
 * directo a comprar.
 */
const EventsSection = () => {
  const { events } = useAuth();
  const { ref: headerRef, isVisible: headerVisible } = useScrollReveal({ threshold: 0.3 });
  const { ref: gridContainerRef, isVisible: gridVisible } = useScrollReveal({ threshold: 0.1 });

  /**
   * Eventos activos y agotados, ordenados por fecha, **con los días de una
   * misma fiesta colapsados en una sola tarjeta** (v26).
   *
   * Una fiesta de tres días son tres eventos en la base; acá tiene que ser una
   * tarjeta, o la home de una fecha de fin de semana largo es la misma imagen
   * tres veces seguidas. Qué día se compra se elige adentro.
   *
   * **Los agotados van al final.** Una tarjeta que ya no se puede comprar no
   * tiene por qué ocupar el primer lugar de la pantalla: el sort es estable, así
   * que dentro de cada grupo se conserva el orden por fecha.
   *
   * **Las fiestas aparte (Expo) también van acá**, a pedido del cliente, y
   * además tienen su acceso bajo el banner. Se distinguen en un solo punto: su
   * tarjeta no linkea a `/evento/<slug>` sino a `/expofiesta`, la página sin el
   * tema estacional (ver `destinoDe` más abajo).
   */
  const visibleEvents = useMemo(
    () =>
      agruparEventos(events.filter((e) => e.status !== "finalizado")).sort(
        (a, b) => Number(a.agotado) - Number(b.agotado)
      ),
    [events]
  );

  /** A dónde lleva la tarjeta. Una fiesta aparte va a su página sin tema. */
  const destinoDe = (entrada: (typeof visibleEvents)[number]) =>
    esFiestaAparte(entrada.destino) ? RUTA_APARTE : undefined;

  return (
    <section id="eventos" className="section-padding scroll-mt-16 bg-secondary/40 relative overflow-hidden">
      {/* Va ANTES del contenido y en z-0; el contenedor de abajo lleva z-10.
          Así, cuando la araña pasa por detrás de una tarjeta, gana la tarjeta:
          es la regla que la decoración anterior no respetaba. */}
      <SpookySpiders />

      <div className="container-odisea relative z-10">
        {/* Section header */}
        <div
          ref={headerRef}
          className={`text-center mb-8 md:mb-10 transition-all duration-700 ${headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
        >
          <p className="eyebrow mb-3">Calendario</p>
          <h2 className="title-sport text-5xl sm:text-6xl md:text-7xl lg:text-8xl mb-4 text-tinta">
            PRÓXIMOS <span className="highlight-celeste">EVENTOS</span>
          </h2>
          <div className={`mx-auto h-px w-16 bg-celeste transition-all duration-500 delay-200 ${headerVisible ? 'scale-x-100' : 'scale-x-0'}`} />
        </div>

        {/* El ref vive en un wrapper SIEMPRE montado para que el
            IntersectionObserver se enganche aunque los eventos lleguen async */}
        <div
          ref={gridContainerRef}
          className={`transition-all duration-700 ${gridVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
        >
          {visibleEvents.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              No hay eventos disponibles en este momento.
            </p>
          ) : (
            <div className="flex flex-wrap justify-center gap-5 md:gap-6">
              {visibleEvents.map((entrada, index) => (
                <div
                  key={entrada.key}
                  className="flex w-full max-w-[400px] transition-all duration-700 sm:w-[320px] sm:max-w-none"
                  style={{ transitionDelay: `${index * 100}ms` }}
                >
                  {/*
                    La tarjeta muestra lo del GRUPO (nombre, rango de fechas) y
                    linkea al primer día que todavía venda, pero el flyer, la
                    descripción y el Instagram salen de ese día: son los datos
                    que el grupo no tiene, porque no es una fila en la base
                    sino dos columnas repetidas (v26).

                    `soldOut` y `tickets` vienen ya resueltos del grupo. La
                    tarjeta sabe calcular "agotado" sola, pero para un grupo la
                    cuenta es otra —lo está sólo si lo están TODOS los días— así
                    que se la damos hecha y le pasamos las entradas de todos.
                    Por lo mismo no va `saleEndsAt`: el cierre de un día no
                    cierra la fiesta.
                  */}
                  <EventCard
                    slug={entrada.destino.slug}
                    destino={destinoDe(entrada)}
                    image={entrada.destino.image}
                    imagePosition={entrada.destino.imagePosition}
                    name={entrada.nombre}
                    date={entrada.fecha}
                    location={entrada.lugar}
                    description={entrada.destino.description}
                    instagramUrl={entrada.destino.instagramUrl}
                    soldOut={entrada.agotado}
                    tickets={entrada.dias.flatMap((d) => d.tickets.filter((t) => t.active))}
                    promos={entrada.dias.flatMap((d) => d.promos)}
                    dias={entrada.dias.length}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default EventsSection;
