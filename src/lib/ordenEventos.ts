import { supabase } from "@/lib/supabase";

/**
 * Guarda el orden de la grilla de la home (v32): `events.home_order`.
 *
 * Recibe las entradas de la grilla **en el orden en que tienen que quedar**, cada
 * una con los ids de sus días (una fiesta de varios días es UNA tarjeta pero
 * varios eventos), y le da a todos los días de una tarjeta el mismo número: 0, 1,
 * 2… Se reescribe el orden de TODAS y no sólo de las dos que se movieron, por la
 * misma razón que con los banners: si alguna vez quedaron números repetidos o
 * había eventos sin número, intercambiar dos valores no arregla nada.
 *
 * Va directo a `supabase` y no por `updateEvent`: eso dispararía una recarga de
 * eventos por cada fila (el canal en vivo de `events` escucha cada UPDATE) y acá
 * son todas a la vez. Quien llama recarga UNA vez al final (`refreshEvents`).
 */
export async function guardarOrdenHome(entradas: string[][]): Promise<void> {
  const cambios = entradas.flatMap((ids, i) => ids.map((id) => ({ id, orden: i })));
  await escribir(cambios);
}

/** Vuelve al orden por fecha: borra el número de todos. */
export async function restablecerOrdenHome(ids: string[]): Promise<void> {
  await escribir(ids.map((id) => ({ id, orden: null })));
}

async function escribir(cambios: { id: string; orden: number | null }[]): Promise<void> {
  const resultados = await Promise.all(
    cambios.map(({ id, orden }) =>
      supabase.from("events").update({ home_order: orden }).eq("id", id)
    )
  );
  const fallo = resultados.find((r) => r.error)?.error;
  if (fallo) throw fallo;
}

/** El error de "falta la migración", para decirlo con todas las letras. */
export const faltaMigracionOrden = (err: unknown): boolean => {
  const code = (err as { code?: string } | null)?.code;
  return code === "42703" || code === "PGRST204";
};
