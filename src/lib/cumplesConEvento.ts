import type { BirthdaySignup } from "@/lib/birthdays";

/**
 * Cumpleaños con evento obligatorio (v46).
 *
 * El beneficio se reclama PARA una fecha: un cumpleañero sin evento no se sabe
 * en qué noche darle el regalo. Desde v46 el reclamo de la web y el formulario
 * del panel lo exigen, la base también, y los que quedaron de antes se asignan
 * a mano desde la lista. Los de eventos que ya pasaron se borran con un botón.
 */

/** Hoy como "YYYY-MM-DD" en hora local (no `toISOString`, que pasa a UTC). */
export function hoyLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Los cumpleañeros de un evento que ya pasó: la noche ya fue, el regalo se dio
 * o no, y lo que queda es una foto de cédula guardada sin motivo. El evento del
 * día cuenta como pasado recién al día siguiente.
 */
export function deEventosPasados(
  rows: BirthdaySignup[],
  events: { id: string; date: string }[],
  hoy = hoyLocal()
): BirthdaySignup[] {
  const fecha = new Map(events.map((e) => [e.id, e.date.slice(0, 10)]));
  return rows.filter((b) => {
    if (!b.eventId) return false;
    const f = fecha.get(b.eventId);
    return Boolean(f) && f! < hoy;
  });
}

/** Los que todavía no tienen evento (cargados antes de v46). */
export const sinEvento = (rows: BirthdaySignup[]) => rows.filter((b) => !b.eventId);
