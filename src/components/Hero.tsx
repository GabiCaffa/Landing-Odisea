import odiseaLogo from "@/assets/odisea-logo-black.png";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const Hero = () => {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.2 });

  return (
    <section
      ref={ref}
      className="relative h-[100svh] flex flex-col bg-papel overflow-hidden"
    >
      {/* ─── Fondo minimal ───────────────────────────────────────────────── */}

      {/* Halo de acento muy sutil */}
      <div className="pointer-events-none absolute -top-40 right-[-10%] h-[520px] w-[520px] rounded-full bg-celeste/10 blur-[120px]" />

      {/* Marca de agua tipográfica — neutra, casi imperceptible */}
      <div className="pointer-events-none select-none absolute bottom-16 left-1/2 -translate-x-1/2 title-display font-black leading-none text-tinta/[0.035] text-[30vw] md:text-[18vw]">
        ODÍSEA
      </div>

      {/* ─── Contenido principal (centrado vertical) ─────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center px-4 pt-16">
        <div
          className={`flex flex-col items-center max-w-3xl mx-auto transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {/* Eyebrow */}
          <div className="flex items-center gap-3 mb-4">
            <span className="h-px w-8 bg-celeste" />
            <span className="eyebrow">Productora de eventos</span>
          </div>

          {/* Logo */}
          <img
            src={odiseaLogo}
            alt="ODÍSEA"
            className="w-40 sm:w-48 md:w-56 lg:w-64 h-auto object-contain mb-5"
          />

          {/* Tagline grande */}
          <h1 className="title-display text-[2.25rem] leading-[0.95] sm:text-5xl md:text-6xl text-tinta mb-4">
            EXPERIENCIAS QUE
            <br />
            <span className="highlight-celeste">TRASCIENDEN</span>
          </h1>

          {/* Subtexto */}
          <p className="text-sm md:text-base text-muted-foreground max-w-lg leading-relaxed mb-7">
            Música, encuentro y noches que se quedan. Viví la próxima fecha de ODÍSEA.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 w-full sm:w-auto">
            <a href="#eventos" className="btn-celeste w-full sm:w-auto group">
              Ver eventos
              <svg
                className="w-4 h-4 group-hover:translate-x-0.5 transition-transform"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </a>
            <a href="#promos" className="btn-techno-outline w-full sm:w-auto">
              Ver promociones
            </a>
          </div>
        </div>
      </div>

      {/* Botón "Ver más" — zona inferior fija, sin superponerse */}
      <div className="shrink-0 flex justify-center pb-5 md:pb-7">
        <a
          href="#eventos"
          className="group inline-flex flex-col items-center gap-1 text-muted-foreground hover:text-celeste transition-colors"
        >
          <span className="text-[11px] font-semibold tracking-[0.25em] uppercase">Ver más</span>
          <svg
            className="w-5 h-5 animate-bounce"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </a>
      </div>
    </section>
  );
};

export default Hero;
