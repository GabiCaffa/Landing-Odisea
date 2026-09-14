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
  /**
   * Los pies del dibujo, en px desde el borde superior del contenedor, en sus
   * dos extremos del ciclo. La araña sube y baja por el hilo, así que un solo
   * valor no alcanza y cada grupo necesita un extremo distinto.
   */
  const pieRef = useRef({ min: 0, max: 0 });

  const [titulo, setTitulo] = useState<Puesto | null>(null);
  const [abajo, setAbajo] = useState<Puesto[]>([]);

  /**
   * Mide hasta dónde llega el dibujo dentro de su caja **recorriendo todo el
   * ciclo** con `goToAndStop`, y se queda con los dos extremos.
   *
   * Medir un solo fotograma fue el error anterior: la araña sube y baja por el
   * hilo durante la animación, así que el fotograma inicial da un valor que no
   * vale para el resto del ciclo — y quedaba colgando lejísimos del anclaje.
   *
   * Se guardan los dos extremos porque cada grupo necesita uno distinto: la del
   * título oscila alrededor del promedio, y las de abajo se anclan por el
   * mínimo (su punto más alto) para no meterse nunca detrás de la tarjeta.
   */
  const medirPie = useCallback((anim?: { totalFrames?: number; goToAndStop?: (f: number, isFrame: boolean) => void; play?: () => void }) => {
    const el = refTitulo.current;
    if (!el) return false;

    const fondoDelDibujo = () => {
      const cont = el.getBoundingClientRect();
      const rects = [...el.querySelectorAll("path")]
        .map((p) => p.getBoundingClientRect())
        .filter((r) => r.width > 0.5 && r.height > 0.5);
      return rects.length ? Math.max(...rects.map((r) => r.bottom)) - cont.top : null;
    };

    const muestras: number[] = [];
    const total = anim?.totalFrames;
    if (anim?.goToAndStop && total) {
      // 16 muestras a lo largo del ciclo: alcanza para los dos extremos sin
      // trabar la página recorriendo fotograma por fotograma.
      for (let i = 0; i < 16; i++) {
        anim.goToAndStop((total * i) / 16, true);
        const v = fondoDelDibujo();
        if (v !== null) muestras.push(v);
      }
      anim.play?.();
    } else {
      const v = fondoDelDibujo();
      if (v !== null) muestras.push(v);
    }

    if (!muestras.length) return false;
    // Los dos extremos, porque cada grupo necesita uno distinto (ver `recolocar`).
    pieRef.current = { min: Math.min(...muestras), max: Math.max(...muestras) };
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
        // El PROMEDIO de los extremos: la araña oscila alrededor del borde del
        // título en vez de tocarlo sólo una vez por vuelta.
        pie: tr.bottom - sr.top - 8 - (pieRef.current.min + pieRef.current.max) / 2,
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
        // El MÍNIMO: es el punto más ALTO del vaivén. Anclando ahí, ni en su
        // momento más alto la araña se mete detrás de la tarjeta — que la
        // taparía, porque van en z-0.
        pie: cr.bottom - sr.top + 26 + i * 20 - pieRef.current.min,
      }))
    );
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const alCargar = useCallback((anim: any) => {
    if (medirPie(anim)) recolocar();
  }, [medirPie, recolocar]);

  /**
   * Se observa la SECCIÓN, no sólo la ventana.
   *
   * Las tarjetas llegan de Supabase **después** de que la araña termina de
   * cargar (su .json es local e instantáneo), así que al medir por primera vez
   * todavía no hay ninguna card y las de abajo se quedaban sin posición, fuera
   * de pantalla. Cuando los eventos aparecen, la sección cambia de alto y el
   * observer dispara el recálculo.
   *
   * De paso cubre el redimensionado de ventana y el apilado en celular, así que
   * reemplaza al listener de `resize`.
   */
  useEffect(() => {
    const sec = refTitulo.current?.closest("section");
    if (!sec) return;
    let t = 0;
    const recalcular = () => {
      clearTimeout(t);
      t = window.setTimeout(() => {
        medirPie();
        recolocar();
      }, 150);
    };
    const obs = new ResizeObserver(recalcular);
    obs.observe(sec);
    return () => {
      obs.disconnect();
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
