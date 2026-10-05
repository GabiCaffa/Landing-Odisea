/**
 * Píxel de Meta (Facebook / Instagram Ads).
 *
 * Hay DOS píxeles y no son intercambiables:
 *
 * - `PIXEL_WEB`: el de toda la web de ODÍSEA. Recibe todo.
 * - `PIXEL_EXPO`: el de la Expo Fiesta (la fiesta "aparte", ver
 *   `fiestasAparte.ts`). Recibe SÓLO lo que pasa en esa sección, para poder
 *   medir y optimizar los anuncios de la Expo por separado.
 *
 * Lo que se mide en la Expo va a los dos: el de la web cuenta TODA la actividad
 * del sitio, y el de la Expo sólo la suya.
 *
 * ─── Por qué no es el snippet pegado en el `<head>` ─────────────────────────
 *
 * Es una SPA: el snippet estándar cuenta el `PageView` de la primera carga y
 * nada más; navegar entre pantallas no vuelve a dispararlo. Por eso hay un
 * `PageView` por cambio de ruta (`PixelPageView`) y eventos propios del negocio
 * (`ViewContent`, `Lead`).
 *
 * `fbevents.js` se baja DESPUÉS del evento `load` y con el navegador libre
 * (misma regla que la decoración, §6.6): no puede competir con el arranque. Los
 * eventos que se emiten antes quedan en la cola del stub de `fbq` y salen cuando
 * llega la librería, así que no se pierde ninguno.
 *
 * ─── Cuándo NO manda nada ──────────────────────────────────────────────────
 *
 * **Sólo en los dominios de producción.** En localhost y en las URLs de preview
 * de Vercel no se carga nada: cada prueba contaminaría los datos reales de los
 * anuncios. En desarrollo los eventos se imprimen por consola para poder
 * verlos. Y tampoco en las rutas privadas (`RUTAS_SIN_PIXEL`): ahí la URL puede
 * llevar un código de sesión, y Meta recibe la URL de la página.
 */

export const PIXEL_WEB = "1782457719620401";
export const PIXEL_EXPO = "2313308699445374";

/** Dónde se carga de verdad. Cualquier otro host: no se carga. */
const HOSTS_PRODUCCION = ["odiseaoficial.com", "www.odiseaoficial.com"];

/**
 * Rutas donde NO se mide: el panel, y las pantallas de cuenta y de sesión. La
 * URL de `/auth/callback` y `/reset-password` lleva un código que no tiene por
 * qué viajar a un tercero.
 */
const RUTAS_SIN_PIXEL = ["/admin", "/auth", "/reset-password", "/recuperar", "/perfil"];

export const rutaConPixel = (pathname: string): boolean =>
  !RUTAS_SIN_PIXEL.some((r) => pathname === r || pathname.startsWith(`${r}/`));

/** A qué píxeles va un evento. */
export type DestinoPixel = "web" | "web+expo" | "expo";

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  loaded: boolean;
  version: string;
  push: unknown;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

const enProduccion = (): boolean =>
  typeof window !== "undefined" && HOSTS_PRODUCCION.includes(window.location.hostname);

const enDesarrollo = (): boolean => import.meta.env.DEV;

let cargado = false;
const iniciados = new Set<string>();

/** El stub oficial de Meta: encola las llamadas hasta que llega `fbevents.js`. */
const instalarStub = (): Fbq => {
  if (window.fbq) return window.fbq;
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  } as Fbq;
  window.fbq = fbq;
  if (!window._fbq) window._fbq = fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  return fbq;
};

/** Baja `fbevents.js` cuando la página ya cargó y el navegador está libre. */
const cargarLibreria = () => {
  if (cargado) return;
  cargado = true;
  const poner = () => {
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(s);
  };
  const cuandoLibre = () => {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(poner, { timeout: 3000 });
    } else {
      window.setTimeout(poner, 1);
    }
  };
  if (document.readyState === "complete") cuandoLibre();
  else window.addEventListener("load", cuandoLibre, { once: true });
};

const asegurarIniciado = (fbq: Fbq, id: string) => {
  if (iniciados.has(id)) return;
  iniciados.add(id);
  fbq("init", id);
};

/**
 * Manda un evento al píxel que corresponda.
 *
 * Se usa `trackSingle` con el id explícito, y no `track`: con dos píxeles
 * iniciados, `track` dispara en TODOS, y el de la Expo recibiría la actividad
 * de toda la web.
 */
export const rastrear = (
  evento: string,
  params?: Record<string, unknown>,
  destino: DestinoPixel = "web"
): void => {
  const ids =
    destino === "expo"
      ? [PIXEL_EXPO]
      : destino === "web+expo"
        ? [PIXEL_WEB, PIXEL_EXPO]
        : [PIXEL_WEB];

  if (!enProduccion()) {
    // Desarrollo: se ve qué saldría, sin mandar nada.
    if (enDesarrollo()) console.debug("[pixel]", evento, params ?? {}, "→", ids.join(" + "));
    return;
  }

  const fbq = instalarStub();
  cargarLibreria();
  for (const id of ids) {
    asegurarIniciado(fbq, id);
    fbq("trackSingle", id, evento, params ?? {});
  }
};
