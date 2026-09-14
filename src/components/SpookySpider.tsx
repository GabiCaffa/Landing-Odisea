import { useCallback, useState } from "react";
import SpookyLottie from "./SpookyLottie";

/**
 * Araña colgando en la sección de eventos, en una posición al azar.
 *
 * **Va DETRÁS de las cards**, no encima. Ésa fue la queja concreta de la
 * decoración anterior y acá se resuelve de raíz: la araña se pinta en `z-0`
 * dentro de la sección y las tarjetas en `z-10`, así que cuando le pasa por
 * detrás gana la tarjeta. Puede colgar en cualquier lado sin tapar nunca nada
 * que haya que leer o tocar.
 *
 * **Se muda, no se teletransporta.** Cambiar la posición de golpe cada tanto se
 * ve como un salto; el ciclo de opacidad la desvanece, y recién ahí —cuando es
 * invisible— se sortea el lugar nuevo.
 */

const rand = (min: number, max: number) => min + Math.random() * (max - min);

/** Se evitan los bordes: colgar a 1% del borde queda cortado en celular. */
const nuevaPosicion = () => rand(7, 86);

const SpookySpider = () => {
  const [left, setLeft] = useState(nuevaPosicion);

  const alTerminarElCiclo = useCallback((e: React.AnimationEvent<HTMLElement>) => {
    // `animationiteration` burbujea: sin este filtro, cualquier animación de
    // adentro dispararía la mudanza. Ya pasó una vez con los murciélagos.
    if (e.target !== e.currentTarget) return;
    setLeft(nuevaPosicion());
  }, []);

  return (
    <div
      className="spooky-arana"
      style={{ left: `${left}%` }}
      onAnimationIteration={alTerminarElCiclo}
      aria-hidden="true"
    >
      <SpookyLottie src="/halloween-spider.json" className="spooky-arana-lottie" speed={0.55} />
    </div>
  );
};

export default SpookySpider;
