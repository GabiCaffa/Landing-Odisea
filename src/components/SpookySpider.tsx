import { useCallback, useEffect, useRef, useState } from "react";
import SpookyLottie from "./SpookyLottie";

/**
 * Araña colgando en la sección de eventos.
 *
 * **Se ancla a elementos reales, no a un porcentaje.** La primera versión
 * sorteaba un `left` a ciegas y la mitad de las veces caía en el vacío al lado
 * del título. Acá se miden el título y las tarjetas en cada ciclo y se elige
 * uno de esos anclajes, así siempre cuelga *de algo*:
 *
 * · **Sobre las letras** del título de la sección.
 * · **En los huecos entre tarjetas** — y no sobre una tarjeta, porque va en
 *   `z-0` y la tarjeta (en `z-10`) la taparía. En el hueco se la ve entera,
 *   colgando entre dos cards.
 *
 * Medir el DOM en vivo resuelve la responsividad sola: en celular las tarjetas
 * se apilan y los anclajes se recalculan solos, sin un `@media` que mantener.
 *
 * **Se muda desvanecida.** El ciclo de opacidad la apaga antes de que se sortee
 * el anclaje nuevo; cambiar de lugar a plena vista se lee como un salto.
 */

interface Ancla {
  /** % del ancho de la sección. */
  left: number;
  /** Alto del contenedor: define a qué profundidad queda el cuerpo. */
  alto: number;
}

const FALLBACK: Ancla = { left: 50, alto: 300 };

/**
 * Lee el título y las tarjetas y arma la lista de lugares donde tiene sentido
 * que cuelgue. Devuelve posiciones relativas a la sección, no a la ventana.
 */
const calcularAnclas = (sec: HTMLElement): Ancla[] => {
  const sr = sec.getBoundingClientRect();
  if (!sr.width) return [];
  const aPorcentaje = (x: number) => ((x - sr.left) / sr.width) * 100;
  const anclas: Ancla[] = [];

  // Sobre las letras del título.
  const titulo = sec.querySelector<HTMLElement>(".title-sport");
  if (titulo) {
    const tr = titulo.getBoundingClientRect();
    for (let i = 1; i <= 4; i++) {
      anclas.push({
        left: aPorcentaje(tr.left + (tr.width * i) / 5),
        // Cuelga justo por debajo de la línea de base del título.
        alto: tr.bottom - sr.top + 36,
      });
    }
  }

  // Colgando HASTA el borde superior de una tarjeta.
  //
  // Primero probé los huecos entre tarjetas, pero miden ~32px y la araña 64-100:
  // quedaba casi toda escondida detrás de las cards. Así, en cambio, el cuerpo
  // queda justo sobre el borde de la tarjeta —en el aire, visible— y los pocos
  // píxeles que se solapan los tapa la card (va en z-0). Se lee como una araña
  // descolgándose sobre la tarjeta, que es lo que se pidió.
  const cards = [...sec.querySelectorAll<HTMLElement>("article")]
    .map((c) => c.getBoundingClientRect())
    .filter((r) => r.width > 0);

  for (const card of cards) {
    anclas.push({
      left: aPorcentaje(card.left + card.width / 2),
      // +18: apenas por debajo del borde, para que "toque" la tarjeta.
      alto: Math.max(120, card.top - sr.top + 18),
    });
  }

  return anclas;
};

const SpookySpider = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [ancla, setAncla] = useState<Ancla>(FALLBACK);

  const resortear = useCallback(() => {
    const sec = ref.current?.closest("section");
    if (!sec) return;
    const anclas = calcularAnclas(sec as HTMLElement);
    if (!anclas.length) return;
    setAncla(anclas[Math.floor(Math.random() * anclas.length)]);
  }, []);

  // Primer anclaje y recálculo al cambiar el tamaño de la ventana: las
  // tarjetas se reacomodan y el anclaje viejo deja de tener sentido.
  useEffect(() => {
    resortear();
    let t = 0;
    const onResize = () => {
      clearTimeout(t);
      t = window.setTimeout(resortear, 200);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(t);
    };
  }, [resortear]);

  const alTerminarElCiclo = useCallback(
    (e: React.AnimationEvent<HTMLElement>) => {
      // `animationiteration` burbujea: sin el filtro, cualquier animación de
      // adentro dispararía la mudanza. Ya pasó con los murciélagos.
      if (e.target !== e.currentTarget) return;
      resortear();
    },
    [resortear]
  );

  return (
    <div
      ref={ref}
      className="spooky-arana"
      style={{ left: `${ancla.left}%`, height: `${ancla.alto}px` }}
      onAnimationIteration={alTerminarElCiclo}
      aria-hidden="true"
    >
      <SpookyLottie src="/halloween-spider.json" className="spooky-arana-lottie" speed={0.55} />
    </div>
  );
};

export default SpookySpider;
