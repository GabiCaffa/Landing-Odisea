import { useCallback, useEffect, useRef, useState } from "react";
import SpookyLottie from "./SpookyLottie";

/**
 * Araña colgando en la sección de eventos.
 *
 * **Se ancla a elementos reales, no a un porcentaje.** La primera versión
 * sorteaba un `left` a ciegas y la mitad de las veces caía en el vacío al lado
 * del título. Ahora se miden el título y las tarjetas en cada ciclo y se elige
 * uno de esos anclajes: sobre las letras del título, o colgando hasta el borde
 * superior de una tarjeta.
 *
 * **La caja de la animación NO es el bicho.** Esto costó un rato: el dibujo
 * ocupa sólo del 5% al 23% de su contenedor y el 77% de abajo está vacío
 * —el archivo tiene la telaraña colgando muy por encima del viewBox—. Calcular
 * la altura del contenedor para "llegar" al título dejaba la araña flotando
 * mucho más arriba. La solución es no adivinar: se **mide dónde caen los pies
 * del dibujo ya renderizado** (`medirPie`) y se posiciona el contenedor
 * restando ese offset, así el bicho aterriza exactamente en el anclaje.
 *
 * Medir el DOM también resuelve la responsividad sola: en celular las tarjetas
 * se apilan y los anclajes se recalculan, sin un `@media` que mantener.
 */

/** Alto fijo del contenedor: el ancho manda el tamaño del dibujo, y el alto
 *  sólo tiene que dar lugar a la telaraña que cuelga por encima. */
const ALTO = 420;

interface Ancla {
  /** % del ancho de la sección (apunta al CENTRO: el CSS lo compensa). */
  left: number;
  /** Y en px desde el borde superior de la sección donde tienen que caer los pies. */
  pie: number;
}

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
        pie: tr.bottom - sr.top - 10,
      });
    }
  }

  // Colgando hasta el borde superior de una tarjeta.
  //
  // Probé primero los huecos ENTRE tarjetas, pero miden ~32px y la araña 64-100:
  // quedaba casi toda escondida detrás de las cards. Así el cuerpo queda en el
  // aire, sobre el borde, y los pocos píxeles que se solapan los tapa la
  // tarjeta (la araña va en z-0). Se lee como descolgándose sobre la card.
  for (const card of sec.querySelectorAll<HTMLElement>("article")) {
    const cr = card.getBoundingClientRect();
    if (!cr.width) continue;
    anclas.push({
      left: aPorcentaje(cr.left + cr.width / 2),
      pie: cr.top - sr.top + 16,
    });
  }

  return anclas;
};

const SpookySpider = () => {
  const ref = useRef<HTMLDivElement>(null);
  /** Distancia desde el borde superior del contenedor hasta los pies del dibujo. */
  const pieRef = useRef(0);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  /**
   * Mide en el SVG ya renderizado hasta dónde llega el dibujo. Los `path`
   * llevan las transformaciones de Lottie aplicadas, así que sus rects en
   * pantalla son el dato real — a diferencia de `getBBox()`, que devuelve
   * coordenadas sin transformar y acá da valores fuera del viewBox.
   */
  const medirPie = useCallback(() => {
    const el = ref.current;
    if (!el) return false;
    const cont = el.getBoundingClientRect();
    const rects = [...el.querySelectorAll("path")]
      .map((p) => p.getBoundingClientRect())
      .filter((r) => r.width > 0.5 && r.height > 0.5);
    if (!rects.length) return false;
    pieRef.current = Math.max(...rects.map((r) => r.bottom)) - cont.top;
    return true;
  }, []);

  const resortear = useCallback(() => {
    const el = ref.current;
    const sec = el?.closest("section");
    if (!el || !sec) return;
    const anclas = calcularAnclas(sec as HTMLElement);
    if (!anclas.length) return;
    const a = anclas[Math.floor(Math.random() * anclas.length)];
    // El contenedor se corre hacia arriba tanto como el dibujo esté "adelantado"
    // dentro de él: así los pies caen justo en el anclaje.
    setPos({ left: a.left, top: a.pie - pieRef.current });
  }, []);

  const alCargar = useCallback(() => {
    // El SVG recién existe: se mide y se coloca por primera vez.
    if (medirPie()) resortear();
  }, [medirPie, resortear]);

  // Recolocar al cambiar el tamaño: las tarjetas se reacomodan y el anclaje
  // viejo deja de tener sentido.
  useEffect(() => {
    let t = 0;
    const onResize = () => {
      clearTimeout(t);
      t = window.setTimeout(() => {
        medirPie();
        resortear();
      }, 200);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(t);
    };
  }, [medirPie, resortear]);

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
      style={{
        height: `${ALTO}px`,
        left: pos ? `${pos.left}%` : "50%",
        top: pos ? `${pos.top}px` : "-9999px", // fuera de vista hasta medir
      }}
      onAnimationIteration={alTerminarElCiclo}
      aria-hidden="true"
    >
      <SpookyLottie
        src="/halloween-spider.json"
        className="spooky-arana-lottie"
        speed={0.55}
        onReady={alCargar}
      />
    </div>
  );
};

export default SpookySpider;
