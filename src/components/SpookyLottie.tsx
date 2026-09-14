import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";

/**
 * Animación de Halloween hecha por un ilustrador, reproducida con Lottie.
 *
 * **Por qué Lottie y no más SVG a mano.** La versión anterior de la decoración
 * eran murciélagos y hojas dibujados por mí: por más planos, desenfoque y
 * variación que se les pusiera, se leían como calcomanías. Con Lottie el dibujo
 * lo hace alguien que sabe dibujar y acá sólo se reproduce.
 *
 * Cuatro reglas que salen directo de lo que falló antes:
 *
 * 1. **Va DETRÁS del contenido, y sólo en el hero.** La capa vieja estaba en
 *    `z-30`, encima de todo, y los bichos cruzaban por delante de las cards.
 *    Acá vive dentro del hero —que no tiene tarjetas— y por debajo de su texto.
 *    Las secciones de abajo tienen fondo opaco, así que una capa fija detrás
 *    sería invisible: por eso no se intenta cubrir toda la página.
 * 2. **Lenta.** `setSpeed` por debajo de 1. Lo que se veía mal antes no era
 *    sólo el dibujo: cruzar la pantalla en 7 segundos es agresivo.
 * 3. **El runtime se carga aparte.** `lottie-web` pesa y no tiene por qué
 *    entrar en el bundle de nadie: se importa dinámicamente y sólo cuando el
 *    tema está prendido, así la paleta base no paga nada.
 * 4. **Si no está el archivo, no pasa nada.** Igual que el audio de ambiente:
 *    sin `public/halloween-lottie.json` esto no renderiza y el sitio sigue
 *    exactamente igual.
 */

/** Poner el .json acá lo activa. Ver las instrucciones en CLAUDE.md. */
const LOTTIE_SRC = "/halloween-lottie.json";

/** Por debajo de 1 = más lento que como lo exportó el ilustrador. */
const VELOCIDAD = 0.45;

const SpookyLottie = () => {
  const { theme } = useTheme();
  const contenedor = useRef<HTMLDivElement>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    if (theme !== "halloween") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cancelado = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let anim: any = null;

    (async () => {
      try {
        // El archivo primero: si no está, ni siquiera se descarga el runtime.
        // Sin `cache: "force-cache"`: parece un ahorro y es un footgun — el navegador
        // se queda con la copia vieja sin revalidar, así que cambiar de animación
        // no se vería hasta que a alguien se le venza el caché. El caché HTTP
        // normal ya hace bien este trabajo.
        const res = await fetch(LOTTIE_SRC);
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
        anim.setSpeed(VELOCIDAD);
        setListo(true);
      } catch (err) {
        // En producción esto es decoración opcional: si el archivo no está o
        // el JSON es inválido, no pasa nada y nadie tiene por qué enterarse.
        // En desarrollo SÍ se avisa: un catch mudo acá ya costó una tarde de
        // no entender por qué el contenedor quedaba vacío.
        if (import.meta.env.DEV) console.warn("[lottie] no se pudo cargar:", err);
      }
    })();

    return () => {
      cancelado = true;
      if (anim) anim.destroy();
    };
  }, [theme]);

  if (theme !== "halloween") return null;

  return (
    <div
      ref={contenedor}
      className={`hero-lottie${listo ? " hero-lottie--visible" : ""}`}
      aria-hidden="true"
    />
  );
};

export default SpookyLottie;
