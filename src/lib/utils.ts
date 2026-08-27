import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Texto sin tildes ni mayúsculas ─────────────────────────────────────────
// Vivía dentro de UserSearchSelect; se subió acá porque el parser de mensajes
// de WhatsApp necesita comparar lo mismo (etiquetas y nombres de evento).

/**
 * Pasa una letra a minúscula y sin tilde. NFD separa la letra de su acento y
 * \p{M} borra la marca que queda suelta (se usa la propiedad Unicode y no un
 * rango tipo [U+0300-U+036F] porque el rango obliga a escribir marcas
 * combinantes en el fuente, que en cualquier editor se pegan al carácter
 * anterior y se pierden en un reformateo).
 *
 * Devuelve SIEMPRE un carácter por carácter (si el plegado no dejara ninguno,
 * se queda el original): así los índices del texto plegado coinciden con los
 * del original y quien lo use puede resaltar exactamente lo que coincidió.
 * No cambiar esa garantía.
 */
export const foldChar = (ch: string) => {
  const folded = ch.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  return folded.length === 1 ? folded : ch.toLowerCase();
};

/** "Pérez" → "perez", "Ñandú" → "nandu". Misma longitud que la entrada. */
export const foldText = (s: string) => Array.from(s).map(foldChar).join("");
