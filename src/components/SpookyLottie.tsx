import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";

/**
 * Reproduce una animación de Lottie. La usan el murciélago del hero y la araña
 * de la sección de eventos.
 *
 * **Por qué Lottie y no SVG a mano.** La decoración anterior eran murciélagos y
 * hojas dibujados acá: por más planos y desenfoque que se les pusiera, se leían
 * como calcomanías. El dibujo tiene que venir de un ilustrador; este componente
 * sólo lo pone en pantalla.
 *
 * Tres reglas que salen de lo que falló antes:
 *
 * 1. **Nunca por encima del contenido.** Quien lo usa elige dónde va, pero la
 *    regla es que quede DETRÁS: la capa vieja estaba en `z-30`, encima de todo,
 *    y cruzaba por delante de las cards.
 * 2. **Lento.** `speed` por debajo de 1. Parte de lo que se veía mal antes no
 *    era el dibujo sino la velocidad.
 * 3. **El runtime se carga aparte y sólo si hace falta.** Se consulta PRIMERO
 *    el JSON; si no está, la función retorna **antes** del `import`, así el
 *    chunk de 300 KB no se descarga nunca. Sin archivo esto no renderiza nada y
 *    el sitio sigue idéntico.
 */

interface Props {
  /** Ruta del .json dentro de `public/`. */
  src: string;
  className?: string;
  /** Por debajo de 1 = más lento que como lo exportó el ilustrador. */
  speed?: number;
  /**
   * Se llama cuando el dibujo ya está en el DOM. Recibe la instancia de Lottie
   * para poder recorrer fotogramas con `goToAndStop` y medir el dibujo en
   * distintos momentos del ciclo, no sólo en el inicial.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onReady?: (anim: any) => void;
}

const SpookyLottie = ({ src, className = "", speed = 0.5, onReady }: Props) => {
  const { theme } = useTheme();
  const contenedor = useRef<HTMLDivElement>(null);
  const [listo, setListo] = useState(false);

  // En un ref: cambiar el callback no tiene por qué reiniciar la animación.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    if (theme !== "halloween") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cancelado = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let anim: any = null;

    const cargar = async () => {
      try {
        // El archivo primero: si no está, ni siquiera se descarga el runtime.
        // Sin `cache: "force-cache"`: parece un ahorro y es un footgun — el
        // navegador se queda con la copia vieja sin revalidar, así que cambiar
        // de animación no se vería. El caché HTTP normal ya hace este trabajo.
        const res = await fetch(src);
        if (!res.ok) return;
        const animationData = await res.json();
        if (cancelado || !contenedor.current) return;

        const lottie = (await import("lottie-web")).default;
        if (cancelado || !contenedor.current) return;

        anim = lottie.loadAnimation({
          container: contenedor.current,
          renderer: "svg",
          loop: true,
          autoplay: true,
          animationData,
        });
        anim.setSpeed(speed);
        setListo(true);
        onReadyRef.current?.(anim);
      } catch (err) {
        // En producción es decoración opcional: si el archivo no está o el JSON
        // es inválido, no pasa nada. En desarrollo SÍ se avisa — un catch mudo
        // acá ya costó un rato de no entender por qué el contenedor quedaba
        // vacío.
        if (import.meta.env.DEV) console.warn(`[lottie] ${src} no cargó:`, err);
      }
    };

    /**
     * Se espera a que el navegador esté OCIOSO antes de tocar nada.
     *
     * El runtime son ~77 KB comprimidos y esto es decoración: no tiene por qué
     * competir con el primer render ni con los datos de los eventos. Medido,
     * arrancaba a los 33ms junto con todo lo crítico.
     *
     * Safari no tiene `requestIdleCallback`, así que ahí se usa un temporizador.
     * El `timeout` del idle es la red de seguridad para una pestaña que nunca
     * llega a estar ociosa: igual carga, sólo que tarde.
     */
    const rIC = (window as unknown as {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    });

    let idleId = 0;
    let timerId = 0;
    if (rIC.requestIdleCallback) {
      idleId = rIC.requestIdleCallback(() => void cargar(), { timeout: 4000 });
    } else {
      timerId = window.setTimeout(() => void cargar(), 1500);
    }

    return () => {
      cancelado = true;
      if (idleId && rIC.cancelIdleCallback) rIC.cancelIdleCallback(idleId);
      if (timerId) clearTimeout(timerId);
      if (anim) anim.destroy();
    };
  }, [theme, src, speed]);

  if (theme !== "halloween") return null;

  return (
    <div
      ref={contenedor}
      className={`${className}${listo ? " lottie--visible" : ""}`}
      aria-hidden="true"
    />
  );
};

export default SpookyLottie;
