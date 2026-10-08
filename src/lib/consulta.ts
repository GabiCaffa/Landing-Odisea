/**
 * Eventos "solo consulta" (v31): fiestas privadas o a coordinar que no se venden
 * desde el sitio. En vez de entradas y precios llevan un botón que abre
 * WhatsApp con la consulta ya escrita.
 */

/** El WhatsApp de consultas y ventas de ODÍSEA (sin `+`, como lo quiere `wa.me`). */
export const WHATSAPP_CONSULTAS = "59892592179";

/**
 * El link de WhatsApp con el mensaje armado. Se lee como lo escribiría una
 * persona, con el nombre y la fecha, para que quien atiende sepa de qué fiesta
 * le hablan sin preguntar.
 */
export const urlConsultaEvento = (nombre: string, fecha: string): string =>
  `https://wa.me/${WHATSAPP_CONSULTAS}?text=${encodeURIComponent(
    `Hola! Quiero consultar por ${nombre} (${fecha}).`
  )}`;
