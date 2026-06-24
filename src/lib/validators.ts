import { parsePhoneNumberFromString, AsYouType, CountryCode } from "libphonenumber-js";

// ─── Cédula uruguaya con dígito verificador ─────────────────────────────────
// Algoritmo oficial de la DNIC. Pesos: 2, 9, 8, 7, 6, 3, 4 sobre los 7 primeros.
export function validateUruguayCedula(cedula: string): boolean {
  const clean = cedula.replace(/\D/g, "");
  if (clean.length < 7 || clean.length > 8) return false;
  const padded = clean.padStart(8, "0");
  const digits = padded.split("").map(Number);
  const verifier = digits[7];
  const weights = [2, 9, 8, 7, 6, 3, 4];
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += digits[i] * weights[i];
  const remainder = sum % 10;
  const expected = remainder === 0 ? 0 : 10 - remainder;
  return expected === verifier;
}

// Formato visual: 1.234.567-8
export function formatUruguayCedula(cedula: string): string {
  const clean = cedula.replace(/\D/g, "").slice(0, 8);
  if (clean.length <= 1) return clean;
  if (clean.length <= 4) return `${clean.slice(0, -3)}.${clean.slice(-3)}`;
  if (clean.length <= 7) return `${clean.slice(0, -6)}.${clean.slice(-6, -3)}.${clean.slice(-3)}`;
  return `${clean.slice(0, -7)}.${clean.slice(-7, -4)}.${clean.slice(-4, -1)}-${clean.slice(-1)}`;
}

// ─── DNI argentino: 7 u 8 dígitos ───────────────────────────────────────────
export function validateArgentinaDNI(doc: string): boolean {
  const clean = doc.replace(/\D/g, "");
  return clean.length >= 7 && clean.length <= 8;
}

// ─── CPF brasileño con dígito verificador ───────────────────────────────────
export function validateBrazilCPF(doc: string): boolean {
  const clean = doc.replace(/\D/g, "");
  if (clean.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(clean)) return false; // todos iguales
  const digits = clean.split("").map(Number);

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += digits[i] * (10 - i);
  let check1 = (sum * 10) % 11;
  if (check1 === 10) check1 = 0;
  if (check1 !== digits[9]) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += digits[i] * (11 - i);
  let check2 = (sum * 10) % 11;
  if (check2 === 10) check2 = 0;
  return check2 === digits[10];
}

// ─── RUT chileno con dígito verificador (último puede ser K) ────────────────
export function validateChileRUT(doc: string): boolean {
  const clean = doc.replace(/[^\dkK]/g, "").toUpperCase();
  if (clean.length < 8 || clean.length > 9) return false;
  const body = clean.slice(0, -1);
  const verifier = clean.slice(-1);
  if (!/^\d+$/.test(body)) return false;

  let sum = 0;
  let factor = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const remainder = 11 - (sum % 11);
  const expected = remainder === 11 ? "0" : remainder === 10 ? "K" : String(remainder);
  return expected === verifier;
}

// ─── Documentos para otros países (mínimo 5 dígitos, máximo 15) ─────────────
export function validateGenericDocument(doc: string): boolean {
  const clean = doc.replace(/\D/g, "");
  return clean.length >= 5 && clean.length <= 15;
}

export function validateDocumentByCountry(doc: string, country: string): boolean {
  switch (country) {
    case "UY":
      return validateUruguayCedula(doc);
    case "AR":
      return validateArgentinaDNI(doc);
    case "BR":
      return validateBrazilCPF(doc);
    case "CL":
      return validateChileRUT(doc);
    default:
      return validateGenericDocument(doc);
  }
}

export function documentLabelByCountry(country: string): string {
  switch (country) {
    case "UY": return "Cédula de identidad";
    case "AR": return "DNI";
    case "BR": return "CPF";
    case "CL": return "RUT";
    case "PY": return "Cédula de identidad";
    case "ES": return "DNI / NIE";
    case "MX": return "CURP / INE";
    default:   return "Documento de identidad";
  }
}

export function documentPlaceholderByCountry(country: string): string {
  switch (country) {
    case "UY": return "1.234.567-8";
    case "AR": return "12.345.678";
    case "BR": return "123.456.789-09";
    case "CL": return "12.345.678-K";
    default:   return "Número de documento";
  }
}

// ─── Teléfono internacional ─────────────────────────────────────────────────
export function validatePhone(phone: string, country: CountryCode): boolean {
  const parsed = parsePhoneNumberFromString(phone, country);
  return !!parsed?.isValid();
}

export function normalizePhone(phone: string, country: CountryCode): string | null {
  const parsed = parsePhoneNumberFromString(phone, country);
  if (!parsed?.isValid()) return null;
  return parsed.format("E.164"); // +59899123456
}

export function formatPhoneAsTyped(phone: string, country: CountryCode): string {
  const formatter = new AsYouType(country);
  return formatter.input(phone);
}

export function formatPhoneDisplay(e164: string | undefined | null): string {
  if (!e164) return "";
  const parsed = parsePhoneNumberFromString(e164);
  return parsed?.formatInternational() ?? e164;
}

// ─── Edad ───────────────────────────────────────────────────────────────────
export function calcAge(birthDate: string): number {
  if (!birthDate) return 0;
  const b = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

// ─── Días hasta el próximo cumpleaños desde una fecha de referencia ─────────
// Negativo si ya pasó este año, positivo si es futuro.
export function daysToBirthday(birthDate: string, referenceDate: Date = new Date()): number {
  if (!birthDate) return Infinity;
  const [, m, d] = birthDate.split("-").map(Number);
  if (!m || !d) return Infinity;
  const thisYearBday = new Date(referenceDate.getFullYear(), m - 1, d);
  const diffMs = thisYearBday.getTime() - referenceDate.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

// ─── Birthday cae cerca del evento ─────────────────────────────────────────
// Devuelve true si el cumple del usuario cae dentro de ±windowDays del evento.
export function birthdayMatchesEvent(
  birthDate: string,
  eventDate: string,
  windowDays = 15
): boolean {
  if (!birthDate || !eventDate) return false;
  const [, bm, bd] = birthDate.split("-").map(Number);
  const [ey, em, ed] = eventDate.split("-").map(Number);
  if (!bm || !bd || !ey || !em || !ed) return false;
  const event = new Date(ey, em - 1, ed);
  // Comparar contra el cumple en el mismo año del evento
  const bday = new Date(ey, bm - 1, bd);
  const diffMs = Math.abs(event.getTime() - bday.getTime());
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= windowDays;
}
