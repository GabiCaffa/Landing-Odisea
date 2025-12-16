import { useRef, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import EventCard from "./EventCard";
import event1 from "@/assets/event-1.jpg";
import event2 from "@/assets/foto4.jpg";
import event3 from "@/assets/event-3.jpg";
import event4 from "@/assets/foto5.jpg";
import event5 from "@/assets/foto6.jpg";
import event6 from "@/assets/foto7.jpg";
import event7 from "@/assets/foto8.jpg";
import { useScrollReveal } from "@/hooks/useScrollReveal";

// Events data updated with real information
const events = [
  {
    id: 1,
    image: event1,
    name: "NAVIDAD CARMELO",
    date: "24 DIC 2025",
    location: "Predio La Querencia, Carmelo",
    description:
      "Celebra la Nochebuena con una experiencia única en Carmelo. Música, energía y magia navideña en el Predio La Querencia.",
    instagramUrl: "https://www.instagram.com/odisea.uy/",
  },
  {
    id: 2,
    image: event2,
    name: "NAVIDAD COLONIA",
    date: "24 DIC 2025",
    location: "Plaza de Toros, Colonia",
    description:
      "Una noche especial en la histórica Plaza de Toros de Colonia. Vive la magia de la Navidad con el mejor ambiente.",
    instagramUrl: "https://www.instagram.com/odisea.uy/",
  },
  {
    id: 3,
    image: event3,
    name: "NAVIDAD PAYSANDÚ",
    date: "24 DIC 2025",
    location: "El Golf, Paysandú",
    description:
      "Nochebuena en Paysandú como nunca antes. Una celebración inolvidable en El Golf con la mejor música y vibras.",
    instagramUrl: "https://www.instagram.com/odisea.uy/",
  },
  {
    id: 4,
    image: event4,
    name: "AÑO NUEVO COLONIA",
    date: "31 DIC 2025",
    location: "Plaza de Toros, Colonia",
    description:
      "Despide el año en grande en la Plaza de Toros de Colonia. Una noche épica para recibir el 2026 con toda la energía.",
    instagramUrl: "https://www.instagram.com/odisea.uy/",
  },
  {
    id: 5,
    image: event5,
    name: "AÑO NUEVO CARMELO",
    date: "31 DIC 2025",
    location: "Predio La Querencia, Carmelo",
    description:
      "Recibe el Año Nuevo en el Predio La Querencia. Una celebración única con la mejor música para comenzar el 2026.",
    instagramUrl: "https://www.instagram.com/odisea.uy/",
  },
  {
    id: 6,
    image: event6,
    name: "ODISEA PUNTA DEL ESTE",
    date: "04 ENE 2026",
    location: "Punta del Este",
    description:
      "Arranca el verano con ODISEA en Punta del Este. Una experiencia que trasciende con la mejor energía del verano uruguayo.",
    instagramUrl: "https://www.instagram.com/odisea.uy/",
  },
  {
    id: 7,
    image: event7,
    name: "ODISEA X 2FANCY SUNSET",
    date: "05 ENE 2026",
    location: "Beverly Hills, Punta del Este",
    description:
      "La collab del verano. ODISEA se une a 2FANCY para un sunset inolvidable en Beverly Hills. Música, playa y las mejores vibras.",
    instagramUrl: "https://www.instagram.com/odisea.uy/",
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