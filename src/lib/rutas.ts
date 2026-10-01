/**
 * La forma de la URL de un evento, en un solo lugar.
 *
 * La comparten **tres** consumidores que no se conocen entre sí: el ruteo de
 * React, las tarjetas que linkean, y —fuera de la app— el plugin `bakeEventos`
 * de `vite.config.ts`, que emite un archivo HTML real por evento y tiene que
 * dejarlo en la misma ruta. Si los tres la escribieran a mano, el día que
 * cambie una el sitio queda con páginas que existen en un lado y no en el otro,
 * y **la falla es silenciosa**: el rewrite de la SPA devuelve la home con
 * HTTP 200 en vez de un 404.
 *
 * Por eso `vite.config.ts` importa de acá con una ruta relativa: este archivo
 * no puede depender de nada del navegador ni del alias `@`, que dentro de la
 * config de Vite todavía no existe.
 */

/** Sin barra final. */
export const RUTA_EVENTO = "/evento";

/** `"halloween-colonia"` → `"/evento/halloween-colonia"`. */
export const urlDeEvento = (slug: string): string => `${RUTA_EVENTO}/${slug}`;

/** El sitio en producción, para URLs absolutas (canonical, Open Graph, sitemap). */
export const SITIO = "https://www.odiseaoficial.com";

/** `"halloween-colonia"` → `"https://www.odiseaoficial.com/evento/halloween-colonia"`. */
export const urlAbsolutaDeEvento = (slug: string): string => `${SITIO}${urlDeEvento(slug)}`;
