import type { Predio } from "./tipos";

/**
 * Qué eventos tienen croquis 3D, por el `slug` de su página (v25).
 *
 * Este archivo NO importa Three.js ni los datos de los predios: lo usa la
 * página del evento para decidir si muestra el botón, y tiene que pesar nada.
 * El predio y el motor se bajan recién al abrir el mapa.
 *
 * Para sumar un predio: un archivo de datos en esta carpeta (molde: `golf.ts`)
 * y una línea acá por cada evento que lo usa. El mismo predio puede servir a
 * varias fechas.
 */
const PREDIOS: Record<string, () => Promise<{ default: Predio }>> = {
  "navidad-en-el-golf-paysandu": () => import("./golf"),
};

export const tieneCroquis = (slug: string | undefined | null): boolean =>
  !!slug && Object.prototype.hasOwnProperty.call(PREDIOS, slug);

export async function cargarPredio(slug: string): Promise<Predio | null> {
  const cargar = PREDIOS[slug];
  if (!cargar) return null;
  return (await cargar()).default;
}
