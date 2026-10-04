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
  CARTEL_KEY,
  DEFAULT_THEME,
  SiteTheme,
  fetchCartel,
  fetchTheme,
  COMISION_KEY,
  fetchComision,
  isSiteTheme,
  limpiarCartel,
  limpiarComision,
  saveCartel,
  saveComision,
  saveTheme,
} from "@/lib/siteSettings";

/**
 * Ajustes globales del sitio (ver supabase/v19_site_settings.sql).
 *
 * Nació para el tema estacional —que sigue siendo su trabajo principal, y por
 * eso el archivo se sigue llamando así— y hoy lee también el **cartel de las
 * tarjetas de evento**. Los valores viven en la DB y se prenden desde el
 * panel; este provider los lee, los escucha por realtime y, en el caso del
 * tema, lo escribe como `data-theme` en <html>, que es donde los bloques de
 * src/index.css redefinen los tokens de color.
 *
 * **Una sola suscripción de realtime para toda la tabla**, repartida por
 * clave. Antes el filtro era `key=eq.theme`; con dos claves, un segundo canal
 * sobre la misma tabla sería gastar una conexión por cada bandera que se
 * agregue.
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
 * Dónde se usa la tipografía estacional. La home más las pantallas de entrada.
 *
 * La lista es explícita y no "todo menos el panel" por un motivo concreto:
 * `.title-sport` lo usan TODAS las páginas, pero en la home, el login y el
 * registro es **un solo título corto** por pantalla, mientras que en Términos,
 * Privacidad y Perfil marca CADA encabezado de sección. Ahí una tipografía de
 * terror convierte un texto legal en algo ilegible.
 *
 * Los formularios de estas rutas no se tocan: etiquetas, campos y mensajes de
 * error siguen en Inter Tight, que es donde la legibilidad decide si alguien
 * termina de registrarse o abandona.
 */
const ENTRADA_PATHS = new Set(["/", "/login", "/registro", "/recuperar", "/reset-password"]);

const isShowcasePath = (pathname: string) => ENTRADA_PATHS.has(pathname);

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
  /**
   * Cartel de las tarjetas de evento. Vacío = sin cartel.
   *
   * **Es texto y nada más: no descuenta.** El precio del evento ya viene con
   * el descuento puesto. Ver `CARTEL_KEY` en src/lib/siteSettings.ts.
   */
  cartel: string;
  /**
   * Cuánto por ciento se le suma al precio para mostrarlo tachado al lado.
   * 0 = no se tacha nada. Ver `COMISION_KEY` en src/lib/siteSettings.ts, que
   * explica por qué se guarda el recargo y no el descuento.
   */
  comisionTicketera: number;
  /** Todavía no llegó el TEMA de la DB (el cartel no lo bloquea). */
  loading: boolean;
  /** Guarda el tema. Sólo el admin pasa el RLS. */
  setTheme: (theme: SiteTheme) => Promise<void>;
  /** Guarda el cartel. Sólo el admin pasa el RLS. */
  setCartel: (texto: string) => Promise<void>;
  /** Guarda el recargo del precio tachado. Sólo el admin pasa el RLS. */
  setComisionTicketera: (recargo: number) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setThemeState] = useState<SiteTheme>(DEFAULT_THEME);
  const [cartel, setCartelState] = useState("");
  const [comisionTicketera, setComisionState] = useState(0);
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
    // En paralelo: son dos filas de la misma tabla y ninguna depende de la
    // otra. `loading` es del TEMA —es lo que decide si se puede pintar la
    // pantalla— así que no espera al cartel: una tarjeta sin su etiqueta medio
    // segundo no se nota; el sitio entero sin color, sí.
    fetchTheme().then((value) => {
      if (cancelled) return;
      setThemeState(value);
      rememberTheme(value);
      setLoading(false);
    });
    fetchCartel().then((value) => {
      if (!cancelled) setCartelState(value);
    });
    fetchComision().then((value) => {
      if (!cancelled) setComisionState(value);
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
        { event: "*", schema: "public", table: "site_settings" },
        (payload) => {
          const fila = payload.new as { key?: unknown; value?: unknown } | null;
          // Un DELETE deja `new` vacío y la clave viene en `old`. Sin mirar
          // los dos, borrar la fila del cartel lo dejaría puesto en las
          // pestañas abiertas hasta que alguien recargue.
          const vieja = payload.old as { key?: unknown } | null;
          const key = fila?.key ?? vieja?.key;

          if (key === "theme") {
            const next = isSiteTheme(fila?.value) ? fila.value : DEFAULT_THEME;
            setThemeState(next);
            rememberTheme(next);
          } else if (key === CARTEL_KEY) {
            setCartelState(limpiarCartel(fila?.value));
          } else if (key === COMISION_KEY) {
            setComisionState(limpiarComision(fila?.value));
          }
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

  const setCartel = useCallback(async (next: string) => {
    await saveCartel(next);
    // No esperamos al realtime para reflejarlo en quien lo cambió.
    setCartelState(limpiarCartel(next));
  }, []);

  const setComisionTicketera = useCallback(async (next: number) => {
    await saveComision(next);
    setComisionState(limpiarComision(next));
  }, []);

  const setTheme = useCallback(async (next: SiteTheme) => {
    await saveTheme(next);
    // No esperamos al realtime para reflejarlo en quien lo cambió.
    setThemeState(next);
    rememberTheme(next);
  }, []);

  return (
    <ThemeContext.Provider value={{
        theme: effective,
        siteTheme: theme,
        cartel,
        comisionTicketera,
        loading,
        setTheme,
        setCartel,
        setComisionTicketera,
      }}>
      {children}
    </ThemeContext.Provider>
  );
};

/**
 * El cartel, sin tener que nombrar al tema. Es azúcar: evita que cada tarjeta
 * tenga que explicar por qué le pide a `useTheme` algo que no es un tema.
 */
export const useCartelEventos = () => useTheme().cartel;

/**
 * El recargo del precio tachado, para los componentes que muestran plata.
 * 0 = no se tacha nada.
 */
export const useComisionTicketera = () => useTheme().comisionTicketera;

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme debe usarse dentro de <ThemeProvider>");
  return ctx;
};
