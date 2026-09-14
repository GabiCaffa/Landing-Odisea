import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import {
  DEFAULT_THEME,
  SiteTheme,
  fetchTheme,
  isSiteTheme,
  saveTheme,
} from "@/lib/siteSettings";

/**
 * Tema estacional del sitio (ver supabase/v19_site_settings.sql).
 *
 * El valor vive en la DB y se prende desde el panel. Este provider lo lee, lo
 * escucha por realtime y lo escribe como `data-theme` en <html>, que es donde
 * los bloques de src/index.css redefinen los tokens de color.
 */

/** Debe coincidir con la clave que usa el script anti-flash de index.html. */
const STORAGE_KEY = "odisea:theme";

/**
 * `?tema=halloween` fuerza un tema sólo para quien abre ese link.
 *
 * Sin esto, la única forma de ver cómo quedó un tema es prenderlo para TODOS
 * los visitantes, que es exactamente la prueba que uno quiere hacer antes de
 * prenderlo. Con el parámetro se revisa en el celular, con calma, mientras el
 * sitio sigue como está.
 *
 * No escribe nada: ni la DB ni el cache. Se cierra la pestaña y no queda rastro.
 */
const PREVIEW_PARAM = "tema";

/**
 * El panel NO se tematiza: es herramienta de trabajo interna y nadie de afuera
 * la ve. Como los tokens son globales, la única forma de dejarlo afuera es no
 * poner el atributo cuando estamos en esa ruta.
 *
 * (La alternativa —envolver el panel y redefinir los tokens ahí— no sirve:
 * modales y toasts salen por portal, fuera de ese wrapper, y quedarían con el
 * tema igual.)
 */
const isThemedPath = (pathname: string) => !pathname.startsWith("/admin");

/**
 * La home es la vidriera: la única pantalla donde la tipografía estacional
 * tiene sentido. En registro, login y perfil los títulos siguen en Inter Tight.
 *
 * No es una cuestión de gusto: `.title-sport` lo usan TODAS las páginas
 * (incluido "INICIAR SESIÓN" y los encabezados de Términos), y una tipografía
 * de terror ahí se lee peor justo donde la persona tiene algo que completar.
 * El color del tema sí llega a esas páginas; la tipografía no.
 */
const isShowcasePath = (pathname: string) => pathname === "/";

/** 'base' = sin atributos, así el CSS de :root queda tal cual. */
const applyTheme = (theme: SiteTheme, showcase: boolean) => {
  const root = document.documentElement;
  if (theme === "base") {
    delete root.dataset.theme;
    delete root.dataset.surface;
    return;
  }
  root.dataset.theme = theme;
  if (showcase) root.dataset.surface = "vidriera";
  else delete root.dataset.surface;
};

const rememberTheme = (theme: SiteTheme) => {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Modo incógnito o storage bloqueado: se pierde sólo el anti-flash.
  }
};

interface ThemeContextValue {
  /** Tema que se está pintando. Puede venir de `?tema=` (vista previa). */
  theme: SiteTheme;
  /** Tema realmente guardado en el sitio. Es el que muestra el panel. */
  siteTheme: SiteTheme;
  /** Todavía no llegó el valor de la DB. */
  loading: boolean;
  /** Guarda el tema. Sólo el admin pasa el RLS. */
  setTheme: (theme: SiteTheme) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setThemeState] = useState<SiteTheme>(DEFAULT_THEME);
  const [loading, setLoading] = useState(true);
  const { pathname } = useLocation();
  const [params] = useSearchParams();

  const preview = params.get(PREVIEW_PARAM);
  // El de la URL gana sobre el de la base, pero sólo para pintar: el panel
  // sigue mostrando y guardando el tema real del sitio.
  const effective = isSiteTheme(preview) ? preview : theme;

  // Carga inicial.
  useEffect(() => {
    let cancelled = false;
    fetchTheme().then((value) => {
      if (cancelled) return;
      setThemeState(value);
      rememberTheme(value);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Realtime: si el admin lo prende, las pestañas ya abiertas cambian solas.
  useEffect(() => {
    const channel = supabase
      .channel("site-settings-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "site_settings", filter: "key=eq.theme" },
        (payload) => {
          const value = (payload.new as { value?: unknown } | null)?.value;
          const next = isSiteTheme(value) ? value : DEFAULT_THEME;
          setThemeState(next);
          rememberTheme(next);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Pinta el atributo. Depende del tema Y de la ruta (el panel queda afuera).
  useEffect(() => {
    applyTheme(isThemedPath(pathname) ? effective : DEFAULT_THEME, isShowcasePath(pathname));
  }, [effective, pathname]);

  const setTheme = useCallback(async (next: SiteTheme) => {
    await saveTheme(next);
    // No esperamos al realtime para reflejarlo en quien lo cambió.
    setThemeState(next);
    rememberTheme(next);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: effective, siteTheme: theme, loading, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme debe usarse dentro de <ThemeProvider>");
  return ctx;
};
