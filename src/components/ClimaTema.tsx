import { useEffect, useRef } from "react";
import { useTheme } from "@/contexts/ThemeContext";

/**
 * Atmósfera de los temas de fin de año: nieve y luces en Navidad; el "2027"
 * de lamparitas, fuegos artificiales y burbujas en Año Nuevo. El dibujo vive
 * en `src/efectos/motorEfectos.ts`.
 *
 * **Va DETRÁS del contenido** (`z-index: -1`), y para eso el contenedor de la
 * home lleva `isolate`: sin esa clase, su `bg-background` taparía el canvas.
 *
 * **El motor se baja DESPUÉS de que la página cargó** y con el navegador
 * libre, igual que la decoración de Halloween: el que llega desde un anuncio
 * tiene que ver la fecha y el botón de comprar antes que la nieve. Mientras
 * tanto el fondo es el color del tema, que ya está bien solo.
 *
 * Con `prefers-reduced-motion` se dibuja un cuadro quieto.
 */
const ClimaTema = () => {
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activo = theme === "navidad" || theme === "anio-nuevo";

  useEffect(() => {
    if (!activo) return;
    let detener: (() => void) | undefined;
    let cancelado = false;

    const arrancar = () => {
      import("@/efectos/motorEfectos").then(({ iniciarEfectos }) => {
        if (cancelado || !canvasRef.current) return;
        const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        detener = iniciarEfectos(canvasRef.current, theme, { quieto });
      });
    };
    const cuandoEsteLibre = () => {
      // Safari no tiene requestIdleCallback.
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(arrancar, { timeout: 3000 });
      } else {
        setTimeout(arrancar, 300);
      }
    };
    if (document.readyState === "complete") cuandoEsteLibre();
    else window.addEventListener("load", cuandoEsteLibre, { once: true });

    return () => {
      cancelado = true;
      window.removeEventListener("load", cuandoEsteLibre);
      detener?.();
    };
  }, [activo, theme]);

  if (!activo) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10"
    />
  );
};

export default ClimaTema;
