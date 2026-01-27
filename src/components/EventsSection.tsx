import { useRef, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import EventCard from "./EventCard";
import event1 from "@/assets/sunset.png";
import event2 from "@/assets/dolorescarru1.jpg";
import event3 from "@/assets/saltocarru.png";
import { useScrollReveal } from "@/hooks/useScrollReveal";

// Events data with ticket configuration
const events = [  
  {
    id: 1,
    image: event1,
    name: "ODISEA SUNSET",
    date: "07 FEBRERO 2026",
    location: "Mojito, colonia del sacramento",
    description: "Vení a disfrutar de la mejor puesta de sol en mojito",
    instagramUrl: "https://www.instagram.com/odisea.uy/",
    tickets: [
      { name: "General", price: 300},

    ]
  },
  {
    id: 2,
    image: event2,
    name: "ODISEA DOLORES",
    date: "14 FEBRERO 2026",
    location: "Costanera general Artigas, rio negro",
    description: "Odisea Dolores te espera...",
    instagramUrl: "https://www.instagram.com/odisea.uy/",
    tickets: [
      {name: "general", price: 300}
    ]
  },
  {
    id: 3,
    image: event3,
    name: "ODISEA SALTO",
    date: "21 FEBRERO 2026",
    location: "LA CHACRA",
    description: "Odisea Salto te espera",
    instagramUrl: "https://www.instagram.com/odisea.uy/",
    tickets: [
      {name: "general", price: 300}
    ]
  },
];

const EventsSection = () => {
  const { ref: headerRef, isVisible: headerVisible } = useScrollReveal({ threshold: 0.3 });
  const { ref: carouselContainerRef, isVisible: carouselVisible } = useScrollReveal({ threshold: 0.1 });
  const carouselRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

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
  }, []);

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
    <section id="eventos" className="section-padding bg-secondary/30">
      <div className="container-odisea">
        {/* Section header */}
        <div 
          ref={headerRef}
          className={`text-center mb-12 md:mb-16 transition-all duration-700 ${headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
        >
          <h2 className="font-display text-4xl md:text-5xl lg:text-6xl tracking-wide mb-4">
            PRÓXIMOS EVENTOS
          </h2>
          <div className={`w-16 h-0.5 bg-foreground mx-auto transition-all duration-500 delay-200 ${headerVisible ? 'scale-x-100' : 'scale-x-0'}`} />
        </div>

        {/* Carousel container */}
        <div 
          ref={carouselContainerRef}
          className={`relative transition-all duration-700 ${carouselVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
        >
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
            {events.map((event, index) => (
              <div
                key={event.id}
                className={`flex-shrink-0 transition-all duration-700`}
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                <EventCard
                  image={event.image}
                  name={event.name}
                  date={event.date}
                  location={event.location}
                  description={event.description}
                  instagramUrl={event.instagramUrl}
                  tickets={event.tickets}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default EventsSection;