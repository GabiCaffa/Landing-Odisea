import { Children, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Las fechas como un grupo que se desliza: la elegida grande al centro y las
 * vecinas asomando a los costados.
 *
 * Sin librería: el deslizar y el "imán" al centro lo hace `scroll-snap`
 * nativo (una dependencia nueva iría al chunk `vendor`, que se precarga en la
 * landing). Lo único que se calcula en JS es **cuál es la del medio**, para
 * resaltarla y para los puntitos.
 *
 * Por qué vuelve el carrusel si antes se lo sacó (grid): el problema era que
 * en celular se veía UNA tarjeta y el borde de la otra, y nadie sabía que había
 * más. Acá las vecinas asoman a propósito y hay puntitos, así que se ve que
 * hay más y se ve cuántas.
 *
 * Tocar una vecina NO navega: la trae al centro. Navegar con un toque a una
 * tarjeta a medio ver, que el dedo rozó al intentar deslizar, es una compra
 * abierta por error.
 */
const CarruselEventos = ({ children }: { children: ReactNode }) => {
  const items = Children.toArray(children);
  const pista = useRef<HTMLDivElement>(null);
  const [activo, setActivo] = useState(0);

  const calcularActivo = useCallback(() => {
    const el = pista.current;
    if (!el) return;
    const centro = el.scrollLeft + el.clientWidth / 2;
    let mejor = 0;
    let dist = Infinity;
    Array.from(el.children).forEach((hijo, i) => {
      const h = hijo as HTMLElement;
      const d = Math.abs(h.offsetLeft + h.offsetWidth / 2 - centro);
      if (d < dist) {
        dist = d;
        mejor = i;
      }
    });
    setActivo(mejor);
  }, []);

  // Un solo cálculo por cuadro mientras se desliza.
  const enFrame = useRef(0);
  const alDeslizar = () => {
    cancelAnimationFrame(enFrame.current);
    enFrame.current = requestAnimationFrame(calcularActivo);
  };

  useEffect(() => {
    calcularActivo();
    window.addEventListener("resize", calcularActivo);
    return () => {
      window.removeEventListener("resize", calcularActivo);
      cancelAnimationFrame(enFrame.current);
    };
  }, [calcularActivo, items.length]);

  const irA = (i: number) => {
    const el = pista.current;
    const hijo = el?.children[i] as HTMLElement | undefined;
    if (!el || !hijo) return;
    const movimientoReducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({
      left: hijo.offsetLeft + hijo.offsetWidth / 2 - el.clientWidth / 2,
      behavior: movimientoReducido ? "auto" : "smooth",
    });
    setActivo(i);
  };

  const hayVarias = items.length > 1;

  return (
    <div role="region" aria-roledescription="carrusel" aria-label="Próximos eventos">
      {/* A todo el ancho de la pantalla, aunque el contenedor de la sección
          tenga márgenes: las vecinas tienen que asomar hasta el borde. */}
      <div className="relative left-1/2 w-screen -translate-x-1/2">
        <div
          ref={pista}
          onScroll={alDeslizar}
          className="flex snap-x snap-mandatory items-stretch gap-4 overflow-x-auto px-[calc(50%-min(35vw,150px))] pb-4 pt-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((item, i) => (
            <div
              key={i}
              role="group"
              aria-roledescription="diapositiva"
              aria-label={`${i + 1} de ${items.length}`}
              // En captura, para ganarle al link de la tarjeta: la vecina se
              // trae al centro en vez de navegar.
              onClickCapture={(e) => {
                if (i !== activo) {
                  e.preventDefault();
                  e.stopPropagation();
                  irA(i);
                }
              }}
              className={`flex w-[70vw] max-w-[300px] flex-none snap-center transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none ${
                i === activo ? "scale-100 opacity-100" : "scale-[0.93] opacity-60"
              }`}
            >
              {item}
            </div>
          ))}
        </div>

        {hayVarias && (
          <>
            <button
              type="button"
              onClick={() => irA(Math.max(0, activo - 1))}
              disabled={activo === 0}
              aria-label="Fecha anterior"
              className="absolute left-4 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-papel/90 text-tinta shadow-md backdrop-blur transition-opacity disabled:opacity-0 md:flex"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => irA(Math.min(items.length - 1, activo + 1))}
              disabled={activo === items.length - 1}
              aria-label="Fecha siguiente"
              className="absolute right-4 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-papel/90 text-tinta shadow-md backdrop-blur transition-opacity disabled:opacity-0 md:flex"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {hayVarias && (
        <div className="mt-2 flex items-center justify-center">
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => irA(i)}
              aria-label={`Ir a la fecha ${i + 1}`}
              aria-current={i === activo}
              // Zona táctil de 44 px alrededor de un punto chico.
              className="flex h-11 w-7 items-center justify-center"
            >
              <span
                className={`block h-2 rounded-full transition-all duration-300 ${
                  i === activo ? "w-6 bg-celeste" : "w-2 bg-tinta/25"
                }`}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default CarruselEventos;
