import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { rastrear, rutaConPixel } from "@/lib/pixel";
import { RUTA_APARTE } from "@/lib/fiestasAparte";

/**
 * Un `PageView` por pantalla.
 *
 * El snippet estándar de Meta sólo cuenta la primera carga; en una SPA el resto
 * de la navegación pasa sin que el píxel se entere. Se dispara al cambiar el
 * `pathname` —no la query—, así un `?tema=` o un rebote no cuentan como otra
 * visita.
 *
 * `/expofiesta` va además al píxel de la Expo. La página de un evento de la
 * Expo (`/evento/<slug>`) no se puede decidir por la ruta —depende de los
 * datos—, así que ésa la manda `Evento` cuando ya sabe de qué evento es.
 */
const PixelPageView = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    if (!rutaConPixel(pathname)) return;
    rastrear("PageView", undefined, pathname === RUTA_APARTE ? "web+expo" : "web");
  }, [pathname]);

  return null;
};

export default PixelPageView;
