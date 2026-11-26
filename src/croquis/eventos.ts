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

export const tieneCroquis = (slug: string | undefined | null): boolean =>
  !!slug && Object.prototype.hasOwnProperty.call(PREDIO_DE_EVENTO, slug);
