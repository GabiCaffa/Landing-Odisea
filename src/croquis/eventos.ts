/**
 * Qué evento usa qué predio, por el `slug` de su página (v25).
 *
 * Archivo SIN dependencias a propósito: lo leen la página del evento (para el
 * botón), `registro.ts` (para cargar el predio) y el horneado del build
 * (`vite/paginasEvento.ts`, para emitir la página `/evento/<slug>/mapa` con su
 * vista previa). Dentro de la config de Vite no existe el alias `@` ni se puede
 * arrastrar Three.js.
 *
 * Para sumar una fecha a un predio que ya existe: una línea acá. Para un predio
 * nuevo: su archivo de datos (molde `golf.ts`) y su línea en `registro.ts`.
 */
export const PREDIO_DE_EVENTO: Record<string, string> = {
  "navidad-en-el-golf-paysandu": "golf",
  "navidad-colonia": "plazaToros",
};

/**
 * Eventos cuyo mapa 3D es una escena HTML hecha aparte (un archivo suelto en
 * `public/mapas/`, con su propio Three.js) en vez de un predio de datos para
 * nuestro motor. Se muestra en un iframe a pantalla completa (`EscenaHtml`),
 * con el mismo botón "Ver el mapa 3D" y la misma dirección `/evento/<slug>/mapa`.
 */
export const ESCENA_HTML_DE_EVENTO: Record<string, { src: string; nombre: string }> = {
  // Escena hecha en conjunto con la organización de Canelones (baile-en-la-carpa.vercel.app).
  "odisea-navidad-canelones": { src: "/mapas/carpa-canelones.html#carpa", nombre: "Baile en la carpa" },
};

const tiene = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

export const escenaHtmlDe = (slug: string | undefined | null) =>
  slug && tiene(ESCENA_HTML_DE_EVENTO, slug) ? ESCENA_HTML_DE_EVENTO[slug] : null;

export const tieneCroquis = (slug: string | undefined | null): boolean =>
  !!slug && (tiene(PREDIO_DE_EVENTO, slug) || tiene(ESCENA_HTML_DE_EVENTO, slug));
