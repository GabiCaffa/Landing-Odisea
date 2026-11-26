import type { Predio } from "./tipos";
import { PREDIO_DE_EVENTO, tieneCroquis } from "./eventos";

export { tieneCroquis };

/**
 * Los predios con croquis 3D. Cada uno se baja recién al abrir el mapa.
 *
 * Qué evento usa qué predio vive en `eventos.ts` (sin dependencias, porque lo
 * lee también el build). El mismo predio puede servir a varias fechas.
 */
const PREDIOS: Record<string, () => Promise<{ default: Predio }>> = {
  golf: () => import("./golf"),
  plazaToros: () => import("./plazaToros"),
};

export async function cargarPredio(slug: string): Promise<Predio | null> {
  const id = PREDIO_DE_EVENTO[slug];
  const cargar = id ? PREDIOS[id] : undefined;
  if (!cargar) return null;
  return (await cargar()).default;
}
