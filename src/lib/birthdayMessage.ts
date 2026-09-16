import type { BirthdaySignup } from "@/lib/birthdays";

/**
 * El mensaje que el encargado de cumpleaños le manda al cumpleañero cuando le
 * aprueba la solicitud.
 *
 * **Está calcado del que el staff ya escribía a mano.** No es un texto
 * inventado: el autor pasó una captura de un mensaje real y esto lo reproduce.
 * Por eso no es un cupón ni un aviso formal, sino una presentación personal —
 * el beneficio son regalitos que el encargado entrega en mano durante la noche,
 * así que lo que importa es que la persona sepa QUIÉN se los va a dar y tenga
 * su número para encontrarlo.
 *
 * Tres reglas del texto, pedidas explícitamente:
 *
 * 1. **Sin emojis.** El original tenía dos o tres por línea. Va con signos de
 *    exclamación en su lugar.
 * 2. **Firma con el nombre real del encargado**, que sale de su perfil. Un
 *    "somos el equipo de ODÍSEA" impersonal rompe justo lo que el mensaje hace.
 * 3. **Que no suene a IA.** En concreto: nada de viñetas, ni de frases
 *    simétricas, ni de "¡Esperamos verte pronto!". Se escribe como habla una
 *    persona en Uruguay.
 *
 * Va en su propio archivo por lo mismo que `purchaseMessage.ts`: el texto que
 * sale a un cliente no se mezcla con la lógica del panel, y así se cambia sin
 * tocar el componente. **Para editar el mensaje, se toca sólo este archivo.**
 */

export interface BirthdayMessageInput {
  /** Nombre del cumpleañero (sólo el primero: el mensaje es informal). */
  nombre: string;
  /** Nombre del encargado que lo manda, de su propio perfil. */
  encargado: string;
  /** Nombre del evento, si la ficha tiene uno asociado. */
  evento?: string | null;
  /** Día del mes del evento ("31"), para el cierre. */
  dia?: string | null;
}

const soloPrimerNombre = (nombre: string) => nombre.trim().split(/\s+/)[0] ?? "";

export function buildBirthdayMessage(input: BirthdayMessageInput): string {
  const nombre = soloPrimerNombre(input.nombre);
  const encargado = soloPrimerNombre(input.encargado);

  // El evento es OPCIONAL en la ficha (`event_id` nullable desde v12), así que
  // el mensaje tiene que poder armarse sin él. Sin evento no se nombra la fecha
  // ni se cierra con "nos vemos el N": quedaría hablando de algo que no existe.
  const conEvento = !!input.evento;

  const lineas = [
    `Hola ${nombre}! Cómo va?`,
    ``,
    conEvento
      ? `Soy ${encargado}, del equipo de ODÍSEA. Te escribo porque tu beneficio de cumpleaños quedó confirmado para ${input.evento}.`
      : `Soy ${encargado}, del equipo de ODÍSEA. Te escribo porque tu beneficio de cumpleaños quedó confirmado.`,
    ``,
    `Yo voy a ser el que te entregue tus regalitos durante la noche, así que te dejo mi número para que estemos en contacto y sea más fácil encontrarnos.`,
    ``,
    `Que pases un cumple increíble!`,
  ];

  if (conEvento && input.dia) lineas.push(``, `Nos vemos el ${input.dia}!`);

  return lineas.join("\n");
}

/**
 * Link de WhatsApp al teléfono del cumpleañero, con el mensaje ya escrito.
 *
 * `wa.me` quiere el número **sin** el `+` ni separadores. Devuelve `null`
 * cuando la ficha no tiene teléfono —es un campo opcional (v12)— para que quien
 * lo llama pueda deshabilitar el botón y explicar por qué, en vez de abrir un
 * chat vacío.
 *
 * > **El mensaje sale del WhatsApp del encargado, o sea de su número personal**,
 * > no del de ODÍSEA. Es una consecuencia de abrir `wa.me` desde su teléfono, y
 * > acá es lo buscado: el texto justamente dice "te dejo mi número". Si alguna
 * > vez tiene que salir del número de ODÍSEA, no se arregla con otro link:
 * > hay que ir a la API de WhatsApp Business.
 */
export function buildBirthdayWhatsAppUrl(
  telefonoE164: string | null | undefined,
  mensaje: string
): string | null {
  const limpio = (telefonoE164 ?? "").replace(/\D/g, "");
  if (!limpio) return null;
  return `https://wa.me/${limpio}?text=${encodeURIComponent(mensaje)}`;
}

/** Arma el mensaje a partir de la ficha, resolviendo nombre, evento y día. */
export function birthdayMessageFor(
  fila: BirthdaySignup,
  encargado: string,
  evento?: { name: string; date?: string | null } | null
): string {
  return buildBirthdayMessage({
    nombre: fila.firstName,
    encargado,
    evento: evento?.name,
    // `date` viene como ISO (yyyy-mm-dd); del día alcanza con el número, que es
    // como se dice ("nos vemos el 31"). Se corta el string en vez de usar
    // `new Date()` a propósito: interpretarlo como fecha lo pasa a UTC y puede
    // devolver el día anterior según la zona horaria.
    dia: evento?.date ? String(Number(evento.date.slice(8, 10))) : null,
  });
}
