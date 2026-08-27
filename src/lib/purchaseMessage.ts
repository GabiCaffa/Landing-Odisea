import { CountryCode } from "libphonenumber-js";
import { formatPhoneDisplay, normalizePhone } from "@/lib/validators";
import { DEFAULT_COUNTRY_CODE } from "@/lib/locations";
import { foldText } from "@/lib/utils";
import type { PaymentAccount } from "@/lib/paymentAccounts";

/**
 * El mensaje de WhatsApp de una compra de entradas: cómo se ARMA y cómo se LEE.
 *
 * Las dos mitades viven juntas a propósito. El comprador manda este texto por
 * WhatsApp y el staff lo pega en el panel para cargar la entrega sin retipear
 * nada; si el armado cambiara en un archivo y el parser quedara en otro, el
 * importador se rompería en silencio (una carga que aparece vacía, sin error).
 * Las etiquetas son constantes compartidas por los dos lados.
 *
 * Al tocar el formato: cambiar `MSG` y revisar `parsePurchaseMessage` de una vez.
 */

export const MSG = {
  greeting: "Buenas! Soy",
  event: "Quiero comprar para",
  total: "TOTAL:",
  birthdayPromo: "PROMO CUMPLEAÑOS APLICADA",
  dataHeader: "Mis datos:",
  fullName: "Nombre completo:",
  email: "Email:",
  phone: "Teléfono:",
  document: "Documento:",
  transferHeader: "Voy a realizar la transferencia a:",
  askAccount: "¿A qué cuenta hago la transferencia?",
  bank: "Banco:",
  accountType: "Tipo de cuenta:",
  accountNumber: "Nro de cuenta:",
  holderDocument: "Documento del titular:",
  receipt: "Comprobante:",
} as const;

// ─── Armado (lo usa TicketPurchaseModal) ────────────────────────────────────

export interface PurchaseMessageItem {
  name: string;
  qty: number;
  /** Precio unitario: en el mensaje se muestra el subtotal (precio × cantidad). */
  price: number;
}

export interface PurchaseMessageInput {
  fullName: string;
  email: string;
  phoneE164: string;
  documentId?: string | null;
  eventName: string;
  /** Fecha ya formateada para leer ("12 de septiembre"). */
  eventDate: string;
  items: PurchaseMessageItem[];
  total: number;
  birthdayPromo?: boolean;
  /** Cuenta de cobro del evento (v13). Sin cuenta, el mensaje la pide. */
  account?: PaymentAccount | null;
}

export function buildPurchaseMessage(input: PurchaseMessageInput): string {
  const firstName = input.fullName.trim().split(/\s+/)[0] ?? "";

  let msg = `${MSG.greeting} ${firstName}\n`;
  msg += `${MSG.event} ${input.eventName} (${input.eventDate}):\n`;
  for (const item of input.items) {
    const subtotal = item.price * item.qty;
    msg += `- ${item.qty} entrada${item.qty > 1 ? "s" : ""} ${item.name} ($${subtotal})\n`;
  }
  msg += `\n${MSG.total} $${input.total}\n`;
  // La promo tiene que viajar en el texto: es lo único que le avisa al staff que
  // a esta persona hay que aplicarle el beneficio. Antes se le mostraba al
  // comprador "aviso en el mensaje de WhatsApp" y el mensaje no decía nada.
  if (input.birthdayPromo) msg += `${MSG.birthdayPromo}\n`;
  msg += `\n${MSG.dataHeader}\n`;
  msg += `${MSG.fullName} ${input.fullName}\n`;
  msg += `${MSG.email} ${input.email}\n`;
  msg += `${MSG.phone} ${formatPhoneDisplay(input.phoneE164)}\n`;
  if (input.documentId) msg += `${MSG.document} ${input.documentId}\n`;

  const account = input.account;
  if (account) {
    msg += `\n${MSG.transferHeader}\n`;
    msg += `${account.holderName}\n`;
    msg += `${MSG.bank} ${account.bank}\n`;
    if (account.accountType) msg += `${MSG.accountType} ${account.accountType}\n`;
    msg += `${MSG.accountNumber} ${account.accountNumber}\n`;
    if (account.documentId) msg += `${MSG.holderDocument} ${account.documentId}\n`;
  } else {
    msg += `\n${MSG.askAccount}\n`;
  }
  msg += `${MSG.receipt} `;
  return msg;
}

// ─── Lectura (lo usa el panel: pegar el mensaje y cargar la entrega) ────────

export interface ParsedPurchaseItem {
  qty: number;
  name: string;
  /** Subtotal que venía en el mensaje, no el precio unitario. */
  amount: number;
}

export interface ParsedPurchase {
  eventName: string | null;
  /** Fecha tal como venía en el mensaje ("12 de septiembre"), sin interpretar. */
  eventDateLabel: string | null;
  fullName: string | null;
  email: string | null;
  phoneE164: string | null;
  /** El teléfono como estaba escrito, para mostrarlo si no se pudo normalizar. */
  phoneRaw: string | null;
  documentId: string | null;
  items: ParsedPurchaseItem[];
  /** Suma de las cantidades de todas las líneas. */
  quantity: number;
  /** El TOTAL declarado en el mensaje. */
  total: number | null;
  /** La suma de los subtotales de las líneas, para contrastar con el TOTAL. */
  itemsTotal: number | null;
  birthdayPromo: boolean;
  /** Desglose legible ("2 General · 1 VIP"), para el campo Notas. */
  itemsSummary: string;
}

export interface ParsePurchaseResult {
  /** Reconoció lo mínimo para cargar una entrega. */
  usable: boolean;
  data: ParsedPurchase;
  /** Lo que hay que mirar antes de guardar (no bloquean). */
  warnings: string[];
}

/**
 * Sello que WhatsApp agrega a cada línea al copiar varios mensajes o exportar
 * el chat: "[12/9/26, 21:03] Juan: ". Copiando un mensaje suelto no aparece,
 * pero si el staff selecciona el chat sí, y sin limpiarlo no matchea nada.
 */
const CHAT_STAMP =
  /^\s*[[(]?\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?\s?m\.?)?[\])]?\s*[-–]?\s*/i;

const ITEM_RE = /^-\s*(\d+)\s+entradas?\s+(.+?)\s*\(\s*\$?\s*([\d.,]+)\s*\)\s*$/i;
const EVENT_RE = /^quiero comprar para\s+(.+?)\s*\(([^)]*)\)\s*:?\s*$/i;
const TOTAL_RE = /^total:\s*\$?\s*([\d.,]+)\s*$/i;

/** Etiquetas conocidas: si una línea empieza con una, no es el nombre del que manda. */
const KNOWN_LABELS = Object.values(MSG).map(foldText);

/**
 * Saca el sello del chat y, si lo había, también el nombre del remitente
 * ("Juan: hola"). El nombre se quita sólo cuando lo que sigue no es una
 * etiqueta nuestra, para no comerse "Nombre completo: Juan Pérez".
 */
function stripChatStamp(line: string): string {
  const withoutStamp = line.replace(CHAT_STAMP, "");
  if (withoutStamp === line) return line;

  const colon = withoutStamp.indexOf(":");
  if (colon > 0 && colon <= 40) {
    const head = foldText(withoutStamp.slice(0, colon + 1));
    if (!KNOWN_LABELS.some((label) => head.startsWith(label))) {
      return withoutStamp.slice(colon + 1).trimStart();
    }
  }
  return withoutStamp;
}

/**
 * Plata escrita a mano: "$1.500", "1500", "1.234,50", "1500,50".
 * Si después del último separador quedan 3 dígitos es de miles ("1.500" = 1500,
 * que es como se escribe en Uruguay); con 1 o 2 dígitos es decimal.
 */
export function parseMoney(raw: string): number | null {
  const clean = raw.replace(/[^\d.,]/g, "");
  if (!clean) return null;

  const sep = Math.max(clean.lastIndexOf("."), clean.lastIndexOf(","));
  if (sep === -1) {
    const n = Number(clean);
    return Number.isFinite(n) ? n : null;
  }

  const decimals = clean.length - sep - 1;
  if (decimals === 3 || decimals === 0) {
    const n = Number(clean.replace(/[.,]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  const int = clean.slice(0, sep).replace(/[.,]/g, "");
  const n = Number(`${int || "0"}.${clean.slice(sep + 1)}`);
  return Number.isFinite(n) ? n : null;
}

/** Busca el valor de una etiqueta al principio de una línea. */
function valueFor(lines: string[], label: string): string | null {
  // foldText conserva la longitud, así que el índice del original sirve.
  const want = foldText(label);
  for (const line of lines) {
    if (foldText(line).startsWith(want)) {
      const value = line.slice(label.length).trim();
      if (value) return value;
    }
  }
  return null;
}

export function parsePurchaseMessage(text: string): ParsePurchaseResult {
  const allLines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => stripChatStamp(line).trim());

  // Todo lo que sigue al bloque de la transferencia es de NUESTRA cuenta de
  // cobro, no del cliente. Si no se corta, "Documento del titular:" se puede
  // colar como documento del comprador.
  const cutMarkers = [MSG.transferHeader, MSG.askAccount, MSG.receipt].map(foldText);
  const cutAt = allLines.findIndex((line) => {
    const folded = foldText(line);
    return cutMarkers.some((marker) => folded.startsWith(marker));
  });
  const lines = cutAt === -1 ? allLines : allLines.slice(0, cutAt);

  const items: ParsedPurchaseItem[] = [];
  let eventName: string | null = null;
  let eventDateLabel: string | null = null;
  let total: number | null = null;

  for (const line of lines) {
    const event = EVENT_RE.exec(line);
    if (event) {
      eventName = event[1].trim() || null;
      eventDateLabel = event[2].trim() || null;
      continue;
    }
    const item = ITEM_RE.exec(line);
    if (item) {
      const qty = parseInt(item[1], 10);
      const amount = parseMoney(item[3]);
      if (Number.isFinite(qty) && qty > 0) {
        items.push({ qty, name: item[2].trim(), amount: amount ?? 0 });
      }
      continue;
    }
    const totalMatch = TOTAL_RE.exec(line);
    if (totalMatch) total = parseMoney(totalMatch[1]);
  }

  const fullName = valueFor(lines, MSG.fullName);
  const rawEmail = valueFor(lines, MSG.email);
  const phoneRaw = valueFor(lines, MSG.phone);
  const documentId = valueFor(lines, MSG.document);

  const email = rawEmail?.toLowerCase() ?? null;
  const phoneE164 = phoneRaw
    ? normalizePhone(phoneRaw, DEFAULT_COUNTRY_CODE as CountryCode)
    : null;

  const quantity = items.reduce((acc, item) => acc + item.qty, 0);
  const itemsTotal = items.length > 0 ? items.reduce((acc, item) => acc + item.amount, 0) : null;
  const birthdayPromo = foldText(text).includes(foldText(MSG.birthdayPromo));

  const warnings: string[] = [];
  if (!fullName) warnings.push("No encontré el nombre completo.");
  if (!email) warnings.push("No encontré el email.");
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) warnings.push(`El email no parece válido: ${email}`);
  if (!phoneRaw) warnings.push("No encontré el teléfono.");
  else if (!phoneE164) warnings.push(`No pude interpretar el teléfono "${phoneRaw}": revisalo a mano.`);
  if (items.length === 0) warnings.push("No encontré las líneas de entradas, así que no sé la cantidad.");
  if (!eventName) warnings.push("No encontré el evento: elegilo a mano.");
  if (total === null && itemsTotal !== null) {
    warnings.push("No encontré el TOTAL: uso la suma de las entradas.");
  }
  if (total !== null && itemsTotal !== null && Math.abs(total - itemsTotal) > 0.01) {
    warnings.push(
      `El TOTAL del mensaje ($${total}) no coincide con la suma de las entradas ($${itemsTotal}). Puede estar editado a mano.`
    );
  }

  const itemsSummary = items.map((item) => `${item.qty} ${item.name}`).join(" · ");

  return {
    usable: !!(fullName && email && items.length > 0),
    data: {
      eventName,
      eventDateLabel,
      fullName,
      email,
      phoneE164,
      phoneRaw,
      documentId,
      items,
      quantity,
      total,
      itemsTotal,
      birthdayPromo,
      itemsSummary,
    },
    warnings,
  };
}
