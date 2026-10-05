import { useRef, useState, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import EventCard from "./EventCard";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { useAuth } from "@/contexts/AuthContext";
import { agruparEventos } from "@/lib/grupos";
import { esFiestaAparte } from "@/lib/fiestasAparte";
import SpookySpiders from "./SpookySpiders";

const EventsSection = () => {
  const { events } = useAuth();
  const { ref: headerRef, isVisible: headerVisible } = useScrollReveal({ threshold: 0.3 });
  const { ref: carouselContainerRef, isVisible: carouselVisible } = useScrollReveal({ threshold: 0.1 });
  const carouselRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  /**
   * Eventos activos y agotados, ordenados por fecha, **con los días de una
   * misma fiesta colapsados en una sola tarjeta** (v26).
   *
   * Una fiesta de tres días son tres eventos en la base; en el carrusel tiene
   * que ser una tarjeta, o la home de una fecha de fin de semana largo es la
   * misma imagen tres veces seguidas. Qué día se compra se elige adentro.
   *
   * Sin ningún evento agrupado `agruparEventos` es la identidad, así que esto
   * no cambia nada para lo que ya existe.
   */
  const visibleEvents = useMemo(
    // Las fiestas aparte (Expo) no van acá: tienen su propia página y su acceso
    // bajo el banner. Mezcladas con las de la temporada confunden.
    () =>
      agruparEventos(
        events.filter((e) => e.status !== "finalizado" && !esFiestaAparte(e))
      ),
    [events]
  );

  const checkScrollability = () => {
    if (carouselRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = carouselRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  useEffect(() => {
    checkScrollability();
    window.addEventListener("resize", checkScrollability);
    return () => window.removeEventListener("resize", checkScrollability);
  }, [visibleEvents]);

  const scroll = (direction: "left" | "right") => {
    if (carouselRef.current) {
      const scrollAmount = 380;
      carouselRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  return (
    <section id="eventos" className="section-padding bg-secondary/40 relative overflow-hidden">
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

        {/* Carousel container — el ref vive en un wrapper SIEMPRE montado para que
            el IntersectionObserver se enganche aunque los eventos lleguen async */}
        <div
          ref={carouselContainerRef}
          className={`transition-all duration-700 ${carouselVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
        >
          {visibleEvents.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              No hay eventos disponibles en este momento.
            </p>
          ) : (
            <div className="relative">
            {/* Left gradient fade */}
            <div
              className={`absolute left-0 top-0 bottom-0 w-16 md:w-32 bg-gradient-to-r from-secondary/30 to-transparent z-10 pointer-events-none transition-opacity duration-300 ${canScrollLeft ? 'opacity-100' : 'opacity-0'}`}
            />

            {/* Right gradient fade */}
            <div
              className={`absolute right-0 top-0 bottom-0 w-16 md:w-32 bg-gradient-to-l from-secondary/30 to-transparent z-10 pointer-events-none transition-opacity duration-300 ${canScrollRight ? 'opacity-100' : 'opacity-0'}`}
            />

            {/* Navigation buttons */}
            <button
              onClick={() => scroll("left")}
              className={`absolute left-2 md:left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 md:w-12 md:h-12 bg-background/90 backdrop-blur-sm border border-border rounded-full flex items-center justify-center transition-all duration-300 hover:bg-foreground hover:text-background ${canScrollLeft ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              aria-label="Anterior"
            >
              <ChevronLeft className="w-5 h-5 md:w-6 md:h-6" />
            </button>

            <button
              onClick={() => scroll("right")}
              className={`absolute right-2 md:right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 md:w-12 md:h-12 bg-background/90 backdrop-blur-sm border border-border rounded-full flex items-center justify-center transition-all duration-300 hover:bg-foreground hover:text-background ${canScrollRight ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              aria-label="Siguiente"
            >
              <ChevronRight className="w-5 h-5 md:w-6 md:h-6" />
            </button>

            {/* Carousel */}
            <div
              ref={carouselRef}
              onScroll={checkScrollability}
              className="flex gap-6 md:gap-8 overflow-x-auto scrollbar-hide pb-4 px-2 md:px-8"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {visibleEvents.map((entrada, index) => (
                <div
                  key={entrada.key}
                  className={`flex-shrink-0 transition-all duration-700`}
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
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default EventsSection;
