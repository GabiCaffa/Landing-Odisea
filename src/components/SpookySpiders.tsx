import { useCallback, useEffect, useRef, useState } from "react";
import SpookyLottie from "./SpookyLottie";

/**
 * Arañas de la sección de eventos. Dos grupos, con reglas distintas:
 *
 * · **Una cuelga del título** ("PRÓXIMOS EVENTOS"), cambiando de letra cada
 *   ciclo. Es la única que se mueve de lugar.
 * · **Tres cuelgan DEBAJO de las tarjetas**, quietas y en colores distintos.
 *   El hilo nace detrás de la card (van en `z-0`) y sólo se ve la araña
 *   asomando por abajo, así que no tapan nada.
 *
 * **La caja de la animación NO es el bicho.** Ésta es la trampa del archivo y
 * costó dos intentos: el dibujo ocupa sólo del 5% al 23% de su contenedor y el
 * 77% de abajo está vacío —la telaraña cuelga muy por encima del viewBox—. Si
 * uno calcula el alto del contenedor para "llegar" a un punto, la araña queda
 * flotando mucho más arriba. Por eso no se adivina: se **mide dónde caen los
 * pies del dibujo ya renderizado** y se resta ese offset.
 *
 * La medición va sobre los `path` y no sobre `getBBox()`: los rects de los
 * `path` llevan aplicadas las transformaciones de Lottie, mientras que
 * `getBBox()` devuelve coordenadas sin transformar, fuera del viewBox.
 *
 * Medir el DOM resuelve la responsividad sola: en celular las tarjetas se
 * apilan y todo se recalcula, sin un `@media` que mantener.
 */

const ALTO = 420;

/** Los colores de las que cuelgan bajo las tarjetas. */
const COLORES = ["negro", "calabaza", "espectro"] as const;

interface Puesto {
  /** % del ancho de la sección; apunta al CENTRO (el CSS compensa con translateX). */
  left: number;
  /** Y en px desde el borde superior de la sección donde caen los pies. */
  pie: number;
}

const SpookySpiders = () => {
  const refTitulo = useRef<HTMLDivElement>(null);
  const refsAbajo = useRef<(HTMLDivElement | null)[]>([]);
  /** Distancia del borde superior del contenedor hasta los pies del dibujo. */
  const pieRef = useRef(0);

  const [titulo, setTitulo] = useState<Puesto | null>(null);
  const [abajo, setAbajo] = useState<Puesto[]>([]);

  /** Mide en el SVG ya renderizado hasta dónde llega el dibujo. */
  const medirPie = useCallback(() => {
    const el = refTitulo.current;
    if (!el) return false;
    const cont = el.getBoundingClientRect();
    const rects = [...el.querySelectorAll("path")]
      .map((p) => p.getBoundingClientRect())
      .filter((r) => r.width > 0.5 && r.height > 0.5);
    if (!rects.length) return false;
    pieRef.current = Math.max(...rects.map((r) => r.bottom)) - cont.top;
    return true;
  }, []);

  const recolocar = useCallback(() => {
    const sec = refTitulo.current?.closest("section");
    if (!sec) return;
    const sr = sec.getBoundingClientRect();
    if (!sr.width) return;
    const aPorcentaje = (x: number) => ((x - sr.left) / sr.width) * 100;

    // ── La del título: una letra al azar de "PRÓXIMOS EVENTOS" ──
    const t = sec.querySelector<HTMLElement>(".title-sport");
    if (t) {
      const tr = t.getBoundingClientRect();
      const i = 1 + Math.floor(Math.random() * 4);
      setTitulo({
        left: aPorcentaje(tr.left + (tr.width * i) / 5),
        pie: tr.bottom - sr.top - 8 - pieRef.current,
      });
    }

    // ── Las de abajo: una por tarjeta, colgando POR DEBAJO de la card ──
    const cards = [...sec.querySelectorAll<HTMLElement>("article")]
      .map((c) => c.getBoundingClientRect())
      .filter((r) => r.width > 0);

    setAbajo(
      cards.slice(0, COLORES.length).map((cr, i) => ({
        // Descentradas entre sí para que no se lean como tres clones.
        left: aPorcentaje(cr.left + cr.width * (0.3 + i * 0.2)),
        // Debajo del borde inferior de la tarjeta, a alturas distintas.
        pie: cr.bottom - sr.top + 34 + i * 22 - pieRef.current,
      }))
    );
  }, []);

  const alCargar = useCallback(() => {
    if (medirPie()) recolocar();
  }, [medirPie, recolocar]);

  useEffect(() => {
    let t = 0;
    const onResize = () => {
      clearTimeout(t);
      t = window.setTimeout(() => {
        medirPie();
        recolocar();
      }, 200);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(t);
    };
  }, [medirPie, recolocar]);

  const alTerminarElCiclo = useCallback(
    (e: React.AnimationEvent<HTMLElement>) => {
      // `animationiteration` burbujea: sin el filtro, cualquier animación de
      // adentro dispararía la mudanza. Ya pasó con los murciélagos.
      if (e.target !== e.currentTarget) return;
      recolocar();
    },
    [recolocar]
  );

  const oculto = { left: "50%", top: "-9999px" };

  return (
    <>
      {/* La que cuelga del título: la única que se muda. */}
      <div
        ref={refTitulo}
        className="spooky-arana spooky-arana--hueso"
        style={
          titulo
            ? { height: `${ALTO}px`, left: `${titulo.left}%`, top: `${titulo.pie}px` }
            : { height: `${ALTO}px`, ...oculto }
        }
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

      {/* Las de abajo: quietas, en colores distintos. */}
      {COLORES.map((color, i) => (
        <div
          key={color}
          ref={(el) => (refsAbajo.current[i] = el)}
          className={`spooky-arana spooky-arana--quieta spooky-arana--${color}`}
          style={
            abajo[i]
              ? { height: `${ALTO}px`, left: `${abajo[i].left}%`, top: `${abajo[i].pie}px` }
              : { height: `${ALTO}px`, ...oculto }
          }
          aria-hidden="true"
        >
          <SpookyLottie
            src="/halloween-spider.json"
            className="spooky-arana-lottie"
            speed={0.4 + i * 0.08}
          />
        </div>
      ))}
    </>
  );
};

export default SpookySpiders;
