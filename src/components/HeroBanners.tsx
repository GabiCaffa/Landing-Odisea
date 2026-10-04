import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SiteBanner } from "@/lib/banners";
import { playThud } from "@/lib/spookySound";

/**
 * Slider de banners del hero (v27).
 *
 * **Sin librería de carrusel, y no es por ahorrar líneas.** `manualChunks`
 * manda cualquier dependencia nueva al chunk `vendor`, que **sí se precarga en
 * la landing** (§6.9): una librería de 40-200 KB la bajaría todo el que entra
 * a mirar una fiesta, para una funcionalidad que el navegador ya trae. El
 * deslizar con el dedo lo hace `scroll-snap` nativo, igual que el carrusel de
 * eventos.
 *
 * Tres decisiones que vienen de errores ya cometidos en este proyecto:
 *
 * - **La primera imagen va `eager` + `fetchpriority="high"`.** Con el slider
 *   prendido, el banner ES el elemento más grande de la primera pantalla, o
 *   sea el LCP. Dejarlo `lazy` sería pelearse con la métrica que §6.6 estuvo
 *   arreglando. Las demás sí van `lazy`: no se ven hasta que alguien desliza.
 * - **El avance automático se detiene cuando no se ve**, con la pestaña en
 *   segundo plano o el hero fuera de pantalla. Misma lección que los Lottie de
 *   §6.4: lo que no está a la vista no tiene por qué consumir hilo principal.
 * - **Se respeta `prefers-reduced-motion`**: ahí no avanza solo. Un carrusel
 *   que se mueve es exactamente lo que esa preferencia pide evitar.
 */

/** Cuánto queda cada banner en pantalla. */
const MS_POR_BANNER = 6000;

interface Props {
  banners: SiteBanner[];
}

const HeroBanners = ({ banners }: Props) => {
  const pistaRef = useRef<HTMLDivElement>(null);
  const [actual, setActual] = useState(0);
  const [visible, setVisible] = useState(true);

  const total = banners.length;

  /**
   * La proporción es UNA para todo el carrusel, y la decide el conjunto:
   * vertical en celular sólo si **todos** los banners tienen versión vertical.
   *
   * Mezclar proporciones no es una opción, y no por prolijidad. Las
   * diapositivas son items de un flex, así que **se estiran a la más alta**:
   * con un 4:5 al lado de un 16:5, al 16:5 le entra el `object-cover` y queda
   * recortado de los costados — en silencio, que es exactamente lo que no se
   * quería hacerle al arte. Así, o están todas las versiones de celular y el
   * hero es alto, o falta alguna y van todos a la franja de 16:5. Sin
   * sorpresas y sin recortes.
   *
   * Medido: con un banner vertical y dos apaisados, los tres quedaban de
   * 469 px y a los apaisados se les comían los costados.
   */
  const todosConMovil = banners.every((b) => b.imageUrlMobile);
  const proporcion = todosConMovil ? "aspect-[4/5] md:aspect-[16/5]" : "aspect-[16/5]";

  const irA = useCallback((i: number) => {
    const pista = pistaRef.current;
    if (!pista) return;
    // El puntito se marca YA, sin esperar al evento de scroll. Son dos cosas:
    // el click se siente inmediato, y el estado no queda colgado de un evento
    // que el navegador puede no despachar —con el documento oculto no manda
    // ninguno, verificado—. Si el scroll termina en otro lado, `alScrollear`
    // corrige.
    setActual(i);
    // Se desplaza por ancho de viewport del contenedor, que es el ancho de
    // cada diapositiva (`w-full` + scroll-snap).
    pista.scrollTo({ left: i * pista.clientWidth, behavior: "smooth" });
  }, []);

  // Qué banner está a la vista, leído del scroll real. Se calcula desde el
  // DOM y no se asume del índice: si alguien desliza con el dedo, el estado
  // tiene que seguirlo o los puntitos mienten.
  const alScrollear = () => {
    const pista = pistaRef.current;
    if (!pista || pista.clientWidth === 0) return;
    setActual(Math.round(pista.scrollLeft / pista.clientWidth));
  };

  // ¿El hero está en pantalla? Con el slider arriba de todo casi siempre lo
  // está al cargar, pero deja de estarlo apenas alguien baja a los eventos.
  useEffect(() => {
    const pista = pistaRef.current;
    if (!pista) return;
    const obs = new IntersectionObserver(
      ([e]) => setVisible(e.isIntersecting),
      { threshold: 0.2 }
    );
    obs.observe(pista);
    return () => obs.disconnect();
  }, []);

  // Avance automático.
  useEffect(() => {
    if (total <= 1 || !visible) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const id = window.setInterval(() => {
      if (document.hidden) return;
      const pista = pistaRef.current;
      if (!pista || pista.clientWidth === 0) return;
      const siguiente = (Math.round(pista.scrollLeft / pista.clientWidth) + 1) % total;
      pista.scrollTo({ left: siguiente * pista.clientWidth, behavior: "smooth" });
    }, MS_POR_BANNER);

    return () => window.clearInterval(id);
  }, [total, visible]);

  if (total === 0) return null;

  return (
    /*
     * El `pt` despeja el header, que es `fixed top-0 z-50` y mide 69 px en
     * celular y 85 en escritorio: FLOTA SOBRE el contenido.
     *
     * El hero clásico no lo necesita porque está hecho para pasarle por
     * debajo, pero un banner no: medido sin esto, el header tapaba 69 de los
     * 117 px de la franja —el 59%— y el click de la parte de arriba se lo
     * comía el header (`elementFromPoint` devolvía un div suyo). Es la misma
     * falla que tuvo la página del evento en v25; van tres veces en este
     * proyecto, así que: contenido nuevo arriba de todo = acordarse del pt.
     */
    <section
      className="relative overflow-hidden bg-papel pt-[69px] md:pt-[85px]"
      aria-roledescription="carrusel"
      aria-label="Novedades de ODÍSEA"
    >
      <div
        ref={pistaRef}
        onScroll={alScrollear}
        className="flex snap-x snap-mandatory overflow-x-auto scrollbar-hide"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {banners.map((b, i) => {
          const contenido = (
            <picture>
              {/*
                La versión vertical sólo si existe. `media` del <source> lo
                resuelve el navegador antes de bajar nada, así que el celular
                no descarga el banner de 1920 para después descartarlo.
              */}
              {/* Sólo si el carrusel entero va vertical: en 16:5 una imagen
                  vertical quedaría recortadísima. */}
              {todosConMovil && b.imageUrlMobile && (
                <source media="(max-width: 767px)" srcSet={b.imageUrlMobile} />
              )}
              <img
                src={b.imageUrl}
                alt={b.alt}
                /* `eager` sólo el primero: es el LCP de la home. */
                loading={i === 0 ? "eager" : "lazy"}
                /*
                 * `fetchpriority` en MINÚSCULAS, y con spread.
                 *
                 * React 18.3.1 —el que usa el proyecto— no conoce la prop
                 * camelCase `fetchPriority`: avisa por consola ("React does
                 * not recognize...") y **no la escribe en el DOM**, o sea que
                 * la prioridad del LCP se perdía en silencio. El atributo en
                 * minúsculas lo pasa tal cual. Va por spread porque los tipos
                 * de React 18 todavía no lo declaran. Cuando el proyecto pase
                 * a React 19, esto puede volver a ser una prop normal.
                 */
                {...(i === 0 ? ({ fetchpriority: "high" } as Record<string, string>) : {})}
                decoding={i === 0 ? "sync" : "async"}
                className="h-full w-full object-cover"
              />
            </picture>
          );

          return (
            <div
              key={b.id}
              className="w-full flex-shrink-0 snap-start"
              role="group"
              aria-roledescription="diapositiva"
              aria-label={`${i + 1} de ${total}`}
            >
              {/*
                La proporción la fija el contenedor y no la imagen, para que el
                navegador reserve el espacio antes de que la foto llegue — si
                no, la página salta al cargar (el mismo "salto de layout" que
                §6.4 arregló en las tarjetas).

                16/5 es el 1920×600 acordado; 4/5 la vertical de celular. Cuál
                de las dos se usa lo decide `proporcion`, arriba, mirando el
                conjunto entero y no cada banner por separado.
              */}
              <div className={proporcion}>
                {b.linkUrl ? (
                  <a
                    href={b.linkUrl}
                    onClick={playThud}
                    className="block h-full w-full"
                    {...(b.linkUrl.startsWith("http")
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                  >
                    {contenido}
                  </a>
                ) : (
                  contenido
                )}
              </div>
            </div>
          );
        })}
      </div>

      {total > 1 && (
        <>
          {/* Flechas sólo de `sm:` para arriba: en el teléfono se desliza con
              el dedo y dos botones encima del arte sólo lo tapan. */}
          <button
            type="button"
            onClick={() => irA((actual - 1 + total) % total)}
            aria-label="Banner anterior"
            className="absolute left-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-papel/80 text-tinta backdrop-blur transition-colors hover:bg-papel sm:flex"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => irA((actual + 1) % total)}
            aria-label="Banner siguiente"
            className="absolute right-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-papel/80 text-tinta backdrop-blur transition-colors hover:bg-papel sm:flex"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          {/* Puntitos. El objetivo táctil es de 44 px aunque el punto se vea
              chico (§6.5): el punto es el dibujo, el botón es el área. */}
          <div className="absolute bottom-0 left-1/2 flex -translate-x-1/2 items-center justify-center">
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                onClick={() => irA(i)}
                aria-label={`Ir al banner ${i + 1}`}
                aria-current={i === actual ? "true" : undefined}
                className="flex h-11 w-7 items-center justify-center"
              >
                <span
                  className={`block h-2 rounded-full transition-all ${
                    i === actual ? "w-6 bg-celeste" : "w-2 bg-tinta/30"
                  }`}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
};

export default HeroBanners;
