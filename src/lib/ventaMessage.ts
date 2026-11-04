/**
 * La respuesta al cliente cuando el staff carga su venta: "recibimos tu
 * comprobante, ya quedaste anotado".
 *
 * Existe por el problema real del flujo: con una sola persona atendiendo el
 * WhatsApp en plena venta, los mensajes quedaban días sin contestar y el
 * cliente no sabía si alguien había visto su comprobante. Al guardar la venta,
 * el panel ofrece abrir el chat con esto ya escrito: contestar es un toque.
 *
 * Mismas reglas de estilo que `birthdayMessage.ts`: sin emojis, como habla una
 * persona en Uruguay, nada de "¡Esperamos verte pronto!". **Para cambiar el
 * texto, se toca sólo este archivo.**
 *
 * No manda nada solo: abre `wa.me` con el texto puesto y quien atiende lo
 * envía. Sale del WhatsApp que esté abierto en ese dispositivo (el Business de
 * ODÍSEA si se usa desde ahí).
 */

export interface ConfirmacionVentaInput {
  /** Nombre del cliente; se usa sólo el primero. */
  nombre: string;
  cantidad: number;
  evento: string;
  /** A dónde le llegan las entradas. */
  email: string;
}

export function buildConfirmacionVenta(input: ConfirmacionVentaInput): string {
  const nombre = input.nombre.trim().split(/\s+/)[0] ?? "";
  const entradas = `${input.cantidad} entrada${input.cantidad === 1 ? "" : "s"}`;
  return [
    `Hola ${nombre}! Recibimos tu comprobante por ${entradas} para ${input.evento}.`,
    ``,
    `Ya quedaste anotado. Las entradas te llegan a ${input.email}, revisá también la carpeta de spam.`,
    ``,
    `Cualquier cosa escribinos por acá.`,
  ].join("\n");
}

/**
 * Link de WhatsApp al cliente con el mensaje escrito. `null` si no hay
 * teléfono, para que quien lo llama deshabilite el botón en vez de abrir un
 * chat vacío.
 */
export function whatsappUrl(telefonoE164: string | null | undefined, mensaje: string): string | null {
  const limpio = (telefonoE164 ?? "").replace(/\D/g, "");
  if (!limpio) return null;
  return `https://wa.me/${limpio}?text=${encodeURIComponent(mensaje)}`;
}
