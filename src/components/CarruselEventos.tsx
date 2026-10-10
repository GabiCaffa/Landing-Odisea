import { Children, ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
 * **Es infinito**: al llegar a la última vuelve a la primera y a la inversa, así
 * nunca hay un costado vacío. Sin librería y sin trucos de scroll falso: las
 * fechas se dibujan TRES veces seguidas (`anteriores | reales | siguientes`) y
 * se arranca en la tanda del medio. Cuando el deslizar termina y quedó en una
 * de las tandas de los costados, se salta —sin animación— a la misma fecha de
 * la tanda del medio. Como las tandas son idénticas, el salto no se ve. Se hace
 * recién cuando el scroll se detuvo: saltar durante el movimiento corta el
 * impulso del dedo.
 *
 * Tocar una vecina NO navega: la trae al centro. Navegar con un toque a una
 * tarjeta a medio ver, que el dedo rozó al intentar deslizar, es una compra
 * abierta por error.
 */
const CarruselEventos = ({ children }: { children: ReactNode }) => {
  const items = Children.toArray(children);
  const n = items.length;
  const loop = n > 1;
  // Con una sola fecha no hay nada que repetir.
  const todos = loop ? [...items, ...items, ...items] : items;

  const pista = useRef<HTMLDivElement>(null);
  // Posición ABSOLUTA entre las `3n` diapositivas; la fecha es `abs % n`.
  const [abs, setAbs] = useState(loop ? n : 0);
  const activo = loop ? abs % n : 0;

  const movimientoReducido = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const centrar = (i: number, suave: boolean) => {
    const el = pista.current;
    const hijo = el?.children[i] as HTMLElement | undefined;
    if (!el || !hijo) return;
    el.scrollTo({
      left: hijo.offsetLeft + hijo.offsetWidth / 2 - el.clientWidth / 2,
      behavior: suave && !movimientoReducido() ? "smooth" : "instant",
    });
  };

  /** Cuánto mide una tanda completa (lo medido, no calculado: hay gap y escalas). */
  const anchoDeTanda = () => {
    const el = pista.current;
    if (!el || el.children.length <= n) return 0;
    return (el.children[n] as HTMLElement).offsetLeft - (el.children[0] as HTMLElement).offsetLeft;
  };

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
    setAbs(mejor);
    return mejor;
  }, []);

  // Al montar (y si cambia la cantidad de fechas): arrancar en la tanda del medio.
  useLayoutEffect(() => {
    if (loop) centrar(n, false);
    calcularActivo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);

  const enFrame = useRef(0);
  const alQuieto = useRef<number>();
  const alDeslizar = () => {
    cancelAnimationFrame(enFrame.current);
    enFrame.current = requestAnimationFrame(calcularActivo);
    if (!loop) return;
    // Cuando el scroll se detuvo, si quedó en una tanda de los costados se
    // vuelve a la del medio. Sin animación y sin que se note.
    window.clearTimeout(alQuieto.current);
    alQuieto.current = window.setTimeout(() => {
      const el = pista.current;
      const actual = calcularActivo();
      const ancho = anchoDeTanda();
      if (!el || actual === undefined || !ancho) return;
      if (actual < n) el.scrollTo({ left: el.scrollLeft + ancho, behavior: "instant" });
      else if (actual >= 2 * n) el.scrollTo({ left: el.scrollLeft - ancho, behavior: "instant" });
    }, 140);
  };

  useEffect(() => {
    const alRedimensionar = () => {
      if (loop) centrar(abs, false);
      calcularActivo();
    };
    window.addEventListener("resize", alRedimensionar);
    return () => {
      window.removeEventListener("resize", alRedimensionar);
      cancelAnimationFrame(enFrame.current);
      window.clearTimeout(alQuieto.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calcularActivo, loop, abs]);

  // Las copias de las tandas de los costados son sólo visuales: se sacan del
  // orden del teclado para que Tab no recorra cada fecha tres veces.
  useEffect(() => {
    if (!loop || !pista.current) return;
    Array.from(pista.current.children).forEach((hijo, i) => {
      if (i >= n && i < 2 * n) return;
      hijo.querySelectorAll<HTMLElement>("a, button").forEach((e) => e.setAttribute("tabindex", "-1"));
    });
  }, [loop, n, todos.length]);

  /** Va a la fecha `i` (0…n-1) por el camino más corto, dando la vuelta si conviene. */
  const irAFecha = (i: number) => {
    if (!loop) return;
    let d = i - activo;
    if (d > n / 2) d -= n;
    else if (d < -n / 2) d += n;
    centrar(abs + d, true);
  };

  const hayVarias = n > 1;

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
          {todos.map((item, i) => {
            const real = loop ? i % n : i;
            const copia = loop && (i < n || i >= 2 * n);
            return (
              <div
                key={i}
                role="group"
                aria-roledescription="diapositiva"
                aria-label={`${real + 1} de ${n}`}
                aria-hidden={copia || undefined}
                // En captura, para ganarle al link de la tarjeta: la vecina se
                // trae al centro en vez de navegar.
                onClickCapture={(e) => {
                  if (i !== abs) {
                    e.preventDefault();
                    e.stopPropagation();
                    centrar(i, true);
                  }
                }}
                // El estilo de "elegida" va por la FECHA y no por la posición: el
                // original y su copia quedan idénticos, así el salto de tanda no
                // dispara ninguna animación.
                className={`flex w-[70vw] max-w-[300px] flex-none snap-center transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none ${
                  real === activo ? "scale-100 opacity-100" : "scale-[0.93] opacity-60"
                }`}
              >
                {item}
              </div>
            );
          })}
        </div>

        {hayVarias && (
          <>
            <button
              type="button"
              onClick={() => irAFecha((activo - 1 + n) % n)}
              aria-label="Fecha anterior"
              className="absolute left-4 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-papel/90 text-tinta shadow-md backdrop-blur md:flex"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => irAFecha((activo + 1) % n)}
              aria-label="Fecha siguiente"
              className="absolute right-4 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-papel/90 text-tinta shadow-md backdrop-blur md:flex"
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
              onClick={() => irAFecha(i)}
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
