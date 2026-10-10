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
      // La sección puede no existir todavía: las que se arman con datos de la
      // red (eventos, galería) aparecen unos instantes después de montar la
      // home. Sin esto, un link a `/#anteriores` desde otra página caía al tope.
      let intentos = 0;
      const t = window.setInterval(() => {
        const e = document.getElementById(hash.slice(1));
        if (e || ++intentos >= 20) {
          window.clearInterval(t);
          e?.scrollIntoView();
        }
      }, 150);
      window.scrollTo(0, 0);
      return () => window.clearInterval(t);
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);

  return null;
};

export default ScrollToTop;
