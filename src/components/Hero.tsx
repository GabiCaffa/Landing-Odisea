import odiseaLogo from "@/assets/odisea-logo-black.png";
import whatsappLogo from "@/assets/whatsapp-logo.png";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const Hero = () => {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.2 });

  return (
    <section 
      ref={ref}
      className="min-h-screen flex items-start justify-center bg-background pt-16 md:pt-20"
    >
      <div className="container-odisea text-center">
        <div className={`max-w-3xl mx-auto space-y-3 md:space-y-4 transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="space-y-2">
            <div className="transition-all duration-700 delay-100" style={{ opacity: isVisible ? 1 : 0, transform: isVisible ? 'translateY(0)' : 'translateY(20px)' }}>
              <img
                src={odiseaLogo}
                alt="ODISEA"
                className="w-80 md:w-96 lg:w-[450px] h-auto mx-auto object-contain"
              />
            </div>

            <p 
              className="text-lg md:text-xl lg:text-2xl tracking-widest uppercase text-muted-foreground transition-all duration-700 delay-200"
              style={{ opacity: isVisible ? 1 : 0, transform: isVisible ? 'translateY(0)' : 'translateY(20px)' }}
            >
              Experiencias que trasciendend
            </p>
          </div>

          <div 
            className="transition-all duration-700 delay-300"
            style={{ opacity: isVisible ? 1 : 0, transform: isVisible ? 'translateY(0)' : 'translateY(20px)' }}
          >
            <a
              href="https://wa.me/59891816716"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-techno group"
            >
              <img src={whatsappLogo} alt="WhatsApp" className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
              <span>Comprar Entradas</span>
            </a>
          </div>

          <div 
            className="pt-4 md:pt-6 transition-all duration-700 delay-500"
            style={{ opacity: isVisible ? 1 : 0, transform: isVisible ? 'translateY(0)' : 'translateY(20px)' }}
          >
            <a
              href="#eventos"
              className="inline-flex flex-col items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-300"
            >
              <span className="text-xs tracking-widest uppercase">Ver Eventos</span>
              <svg
                className="w-5 h-5 animate-bounce"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 14l-7 7m0 0l-7-7m7 7V3"
                />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;