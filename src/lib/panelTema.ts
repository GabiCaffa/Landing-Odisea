import { useEffect, useState } from "react";

/**
 * Claro u oscuro, sólo para el panel.
 *
 * El panel no lleva el tema de temporada del sitio (ver `isThemedPath` en
 * `ThemeContext`): es herramienta de trabajo. Lo que sí tiene es su propio
 * claro/oscuro, que elige cada uno y queda guardado en su navegador. Sin
 * elección, sigue lo que pide el sistema del teléfono o la compu.
 *
 * Se escribe como `data-admin` en `<html>` —donde `index.css` redefine los
 * tokens— y no en un contenedor del panel, porque los modales y los toasts
 * salen por portal, fuera de cualquier contenedor (misma lección que v19).
 * La clase `dark` va junto, para las variantes `dark:` de Tailwind y shadcn.
 */
export type PanelTema = "claro" | "oscuro";

const CLAVE = "odisea:panel-tema";

function temaInicial(): PanelTema {
  try {
    const g = localStorage.getItem(CLAVE);
    if (g === "claro" || g === "oscuro") return g;
  } catch {
    // Storage bloqueado: sigue al sistema.
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "oscuro" : "claro";
}

export function usePanelTema(): [PanelTema, (t: PanelTema) => void] {
  const [tema, setTemaState] = useState<PanelTema>(temaInicial);

  useEffect(() => {
    const html = document.documentElement;
    html.dataset.admin = tema;
    html.classList.toggle("dark", tema === "oscuro");
    // Al salir del panel (Ver sitio), el sitio vuelve a su paleta.
    return () => {
      delete html.dataset.admin;
      html.classList.remove("dark");
    };
  }, [tema]);

  const setTema = (t: PanelTema) => {
    setTemaState(t);
    try {
      localStorage.setItem(CLAVE, t);
    } catch {
      // Se usa igual en esta visita.
    }
  };

  return [tema, setTema];
}
