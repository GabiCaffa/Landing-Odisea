/**
 * Redimensionado de imágenes de Supabase Storage.
 *
 * Los flyers se suben al bucket tal como los manda el diseñador —medidos, hasta
 * **533 KB** cada uno— y se mostraban a 318×238 px. Eran ~990 KB de descarga
 * para llenar tres tarjetas chicas, y el grueso del problema de rendimiento.
 *
 * Supabase tiene un endpoint de transformación que redimensiona y recomprime al
 * vuelo. Cambia una parte de la ruta:
 *
 *   /storage/v1/object/public/…        → el archivo original
 *   /storage/v1/render/image/public/…  → transformado, con ?width y ?quality
 *
 * Y negocia **WebP por el `Accept` del navegador**, sin que haya que pedirlo:
 * medido, el flyer de 414 KB baja a 148 KB. Como es del lado del servidor, no
 * hay que resubir nada ni tocar lo que ya está cargado.
 *
 * El original además venía con `cache-control: no-cache`; el endpoint de
 * transformación responde con `max-age=3600`.
 */

/** Sólo se toca lo que efectivamente es Storage público de Supabase. */
const RUTA_ORIGINAL = "/storage/v1/object/public/";
const RUTA_TRANSFORMADA = "/storage/v1/render/image/public/";

/**
 * 68 es el punto donde el flyer deja de tener artefactos visibles a la vista.
 * Por debajo de 60 se empieza a notar en los degradados de los flyers, que
 * tienen mucho color saturado.
 */
const CALIDAD = 68;

/** Anchos del `srcset`. Cubren 280-320 px de tarjeta a 1x, 2x y 3x. */
const ANCHOS = [320, 480, 640, 960] as const;

const esStorageDeSupabase = (url: string) =>
  url.includes(RUTA_ORIGINAL) && url.includes(".supabase.co");

/** Una sola variante, al ancho pedido. */
export const imagenRedimensionada = (url: string, ancho: number): string => {
  if (!url || !esStorageDeSupabase(url)) return url;
  return `${url.replace(RUTA_ORIGINAL, RUTA_TRANSFORMADA)}?width=${ancho}&quality=${CALIDAD}`;
};

/**
 * El `srcset` completo. Devuelve cadena vacía cuando la URL no es de Supabase
 * —una imagen externa o un `blob:` de vista previa— para que el `<img>` se
 * quede sólo con su `src` y no intente variantes que no existen.
 */
export const srcSetRedimensionado = (url: string): string => {
  if (!url || !esStorageDeSupabase(url)) return "";
  return ANCHOS.map((a) => `${imagenRedimensionada(url, a)} ${a}w`).join(", ");
};

/**
 * Dimensiones intrínsecas para los atributos `width`/`height` del `<img>`.
 *
 * No son el tamaño al que se ve —de eso se encarga el CSS— sino la **proporción**,
 * que es lo que el navegador necesita para reservar el espacio antes de que la
 * imagen llegue. Sin esto, la tarjeta salta cuando carga la foto: es el
 * "salto de layout" que marcaba PageSpeed.
 */
export const PROPORCION_EVENTO = { width: 640, height: 480 } as const;
