import { useRef, useState, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import EventCard from "./EventCard";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { useAuth, formatEventDate } from "@/contexts/AuthContext";

const EventsSection = () => {
  const { events } = useAuth();
  const { ref: headerRef, isVisible: headerVisible } = useScrollReveal({ threshold: 0.3 });
  const { ref: carouselContainerRef, isVisible: carouselVisible } = useScrollReveal({ threshold: 0.1 });
  const carouselRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // Solo eventos activos y agotados, ordenados por fecha
  const visibleEvents = useMemo(
    () =>
      events
        .filter((e) => e.status !== "finalizado")
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date)),
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
    <section id="eventos" className="section-padding bg-secondary/40 relative">
      <div className="container-odisea">
        {/* Section header */}
        <div
          ref={headerRef}
          className={`text-center mb-10 md:mb-16 transition-all duration-700 ${headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
        >
          <p className="eyebrow mb-4">Calendario</p>
          <h2 className="title-sport text-5xl sm:text-6xl md:text-7xl lg:text-8xl mb-6 text-tinta">
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
              {visibleEvents.map((event, index) => (
                <div
                  key={event.id}
                  className={`flex-shrink-0 transition-all duration-700`}
                  style={{ transitionDelay: `${index * 100}ms` }}
                >
                  <EventCard
                    id={event.id}
                    image={event.image}
                    imagePosition={event.imagePosition}
                    name={event.name}
                    date={formatEventDate(event.date)}
                    location={event.location}
                    description={event.description}
                    instagramUrl={event.instagramUrl}
                    soldOut={event.status === "agotado"}
                    tickets={[{ name: "general", price: event.price }]}
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
