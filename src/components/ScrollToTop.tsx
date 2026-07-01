import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Al cambiar de ruta lleva el scroll al tope, para no aterrizar en la posición
 * donde habías quedado en la página anterior. Si la URL trae un ancla (#eventos,
 * #promos, etc.) respeta ese salto en lugar de ir al tope.
 */
const ScrollToTop = () => {
  const { pathname, hash } = useLocation();

  useLayoutEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        el.scrollIntoView();
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);

  return null;
};

export default ScrollToTop;
