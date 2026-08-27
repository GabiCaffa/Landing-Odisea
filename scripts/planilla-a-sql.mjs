#!/usr/bin/env node
/**
 * ODÍSEA · Planilla histórica (Google Sheets) → SQL de ticket_deliveries
 * ═══════════════════════════════════════════════════════════════════════════
 * Uso, una sola vez, para pasar las fechas ya vendidas al panel:
 *
 *   1. En Sheets, por CADA hoja (una por fecha): Archivo → Descargar →
 *      "Valores separados por comas (.csv)". Guardarlos todos en una carpeta,
 *      por ejemplo  planilla/  en la raíz del proyecto.
 *   2. node scripts/planilla-a-sql.mjs planilla > supabase/v19_import_historico.sql
 *   3. Abrir el SQL generado, seguir las instrucciones del encabezado (pegar los
 *      id de cada evento) y correrlo en el SQL Editor de Supabase.
 *
 * Columnas esperadas (las de la planilla actual). Se detectan por el nombre del
 * encabezado, así que el orden puede cambiar; la primera columna del total no
 * tiene encabezado y se toma por posición:
 *
 *   A (sin título)      total pagado        → ticket_deliveries.value
 *   Nombre del comprador                    → first_name + last_name
 *   PRECIO UNITARIO     precio de la entrada→ delivery_ticket_types.unit_price
 *   Teléfono            "598 98 398 480"    → phone en E.164
 *   Mail                                    → email
 *   Tipo de entrada     "General"           → delivery_ticket_types (v18)
 *   Cantidad                                → quantity
 *   Confirmacion        cualquier marca     → status = 'sent'
 *   Cuenta              titular de cobro    → se ignora (v13: es del evento)
 *   Detalle                                 → notes
 *
 * OJO con el verde de la planilla: en la planilla, la fila pintada de verde es
 * "ya le envié las entradas", pero el CSV NO exporta los colores de celda. Hay
 * dos formas de traer ese dato:
 *   · Si en una hoja TODAS las filas cargadas están verdes: --enviadas.
 *   · Si la hoja está mezclada: poner cualquier marca (una "x") en la columna
 *     Confirmacion de las verdes antes de exportar. Fila con marca = enviada.
 *
 * `sent_at` queda en null a propósito: no sabemos de qué día fue el envío, y
 * poner la fecha de la importación diría que se enviaron hoy.
 *
 * Opciones:
 *   --enviadas   marca TODAS las filas como 'sent', ignorando Confirmacion.
 *                Por defecto: 'sent' sólo las que tengan Confirmacion cargada.
 */

import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

const args = process.argv.slice(2);
const markSent = args.includes("--enviadas");
const dir = args.find((a) => !a.startsWith("--"));

if (!dir) {
  console.error("Falta la carpeta con los CSV. Ej: node scripts/planilla-a-sql.mjs planilla");
  process.exit(1);
}

// ─── CSV ────────────────────────────────────────────────────────────────────
/** Parser mínimo con soporte de campos entre comillas y comas adentro. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const push = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    push();
    if (row.some((c) => c.trim() !== "")) rows.push(row);
    row = [];
  };
  const src = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") push();
    else if (ch === "\n") endRow();
    else field += ch;
  }
  if (field !== "" || row.length) endRow();
  return rows;
}

const fold = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase();

/** "$1.500" / "1500,50" → número. Misma regla que parseMoney del front. */
function money(raw) {
  const clean = String(raw ?? "").replace(/[^\d.,]/g, "");
  if (!clean) return null;
  const sep = Math.max(clean.lastIndexOf("."), clean.lastIndexOf(","));
  if (sep === -1) return Number(clean);
  const decimals = clean.length - sep - 1;
  if (decimals === 3 || decimals === 0) return Number(clean.replace(/[.,]/g, ""));
  return Number(`${clean.slice(0, sep).replace(/[.,]/g, "") || "0"}.${clean.slice(sep + 1)}`);
}

/** "598 98 398 480" / "098 398 480" → "+59898398480". */
function phone(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("598")) return `+${digits}`;
  // Formato local: 098 398 480 → se le saca el 0 y se le pone el país.
  if (digits.startsWith("0")) return `+598${digits.slice(1)}`;
  if (digits.length === 8) return `+598${digits}`;
  return `+${digits}`;
}

const q = (v) => (v === null || v === undefined || v === "" ? "null" : `'${String(v).replace(/'/g, "''")}'`);

// ─── Lectura de las hojas ───────────────────────────────────────────────────
const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".csv"));
if (!files.length) {
  console.error(`No hay CSV en ${dir}`);
  process.exit(1);
}

const sheets = [];
const problems = [];

for (const file of files) {
  const rows = parseCsv(readFileSync(join(dir, file), "utf8"));
  if (!rows.length) continue;

  // El encabezado es la primera fila que tenga "nombre del comprador".
  const headerAt = rows.findIndex((r) => r.some((c) => fold(c).includes("nombre del comprador")));
  if (headerAt === -1) {
    problems.push(`${file}: no encontré la fila de encabezados`);
    continue;
  }
  const header = rows[headerAt].map(fold);
  const col = (...names) => header.findIndex((h) => names.some((n) => h.includes(n)));

  const iName = col("nombre del comprador");
  const iUnit = col("precio unitario");
  const iPhone = col("telefono");
  const iMail = col("mail", "email");
  const iType = col("tipo de entrada");
  const iQty = col("cantidad");
  const iConf = col("confirmacion");
  const iDetail = col("detalle");
  // El total no tiene encabezado: es la columna anterior al nombre.
  const iTotal = iName > 0 ? iName - 1 : -1;

  const sheet = { file, name: basename(file, ".csv"), rows: [] };

  for (const r of rows.slice(headerAt + 1)) {
    const name = (r[iName] ?? "").trim();
    const mail = (r[iMail] ?? "").trim();
    // Las filas de plantilla traen "General" y la cuenta, pero sin persona.
    if (!name && !mail) continue;
    if (!mail) {
      problems.push(`${sheet.name}: "${name}" no tiene mail, la salteo`);
      continue;
    }
    const parts = name.split(/\s+/).filter(Boolean);
    const qty = parseInt(String(r[iQty] ?? "").replace(/\D/g, ""), 10) || 1;
    const unit = iUnit === -1 ? null : money(r[iUnit]);
    const total = iTotal === -1 ? null : money(r[iTotal]);
    const value = total ?? (unit !== null ? unit * qty : 0);

    // Mail repetido dentro de la misma hoja: puede ser una persona que compró
    // para otra (legítimo) o una fila cargada dos veces. Se importan las dos y
    // se avisa, porque el conversor no puede decidirlo.
    const twin = sheet.rows.find((x) => x.email === mail.toLowerCase());
    if (twin) {
      const same = twin.quantity === qty && twin.value === value;
      problems.push(
        same
          ? `${sheet.name}: "${name}" repite mail Y compra de "${twin.firstName} ${twin.lastName}" (${qty} x $${value}) — se importa UNA sola`
          : `${sheet.name}: "${name}" comparte el mail ${mail} con "${twin.firstName} ${twin.lastName}", pero la compra es distinta — se importan las dos`
      );
    }

    sheet.rows.push({
      firstName: parts[0] ?? name,
      lastName: parts.slice(1).join(" "),
      email: mail.toLowerCase(),
      phone: phone(r[iPhone]),
      quantity: qty,
      value,
      type: (r[iType] ?? "").trim() || "General",
      unitPrice: unit ?? 0,
      notes: iDetail === -1 ? "" : (r[iDetail] ?? "").trim(),
      // El verde de la planilla no viaja en el CSV: se usa la marca de
      // Confirmacion, o --enviadas si la hoja entera ya fue enviada.
      sent: markSent || (iConf !== -1 && (r[iConf] ?? "").trim() !== ""),
    });
  }
  sheets.push(sheet);
}

// ─── Salida ─────────────────────────────────────────────────────────────────
const out = [];
const total = sheets.reduce((a, s) => a + s.rows.length, 0);

out.push("-- ════════════════════════════════════════════════════════════════════════════");
out.push("-- ODÍSEA · v19 · Importación de la planilla histórica de entregas");
out.push("-- ════════════════════════════════════════════════════════════════════════════");
out.push(`-- Generado por scripts/planilla-a-sql.mjs a partir de ${sheets.length} hoja/s`);
out.push(`-- (${total} filas). NO editar a mano salvo el bloque de ids de abajo.`);
out.push("--");
out.push("-- ANTES de correr esto:");
out.push("--   1) Corré esta consulta y anotá los id:");
out.push("--        select id, name, date, location from public.events order by date;");
out.push("--   2) Reemplazá cada 'PEGAR-ID-...' de abajo por el id del evento que");
out.push("--      corresponde a esa hoja. Si una hoja no va a importarse, borrá su bloque.");
out.push("--");
out.push("-- Es idempotente: no vuelve a cargar una fila si ya existe una entrega con el");
out.push("-- mismo email en el mismo evento, así que se puede correr de nuevo sin duplicar.");
out.push("-- ════════════════════════════════════════════════════════════════════════════");
out.push("");
out.push("begin;");
out.push("");

for (const sheet of sheets) {
  const placeholder = `PEGAR-ID-${sheet.name.replace(/[^A-Za-z0-9]+/g, "-").toUpperCase()}`;
  out.push(`-- ─── Hoja "${sheet.name}" · ${sheet.rows.length} fila/s ${"─".repeat(20)}`);
  out.push("do $$");
  out.push("declare");
  out.push(`  v_event uuid := '${placeholder}';`);
  out.push("  v_delivery uuid;");
  out.push("  v_type uuid;");
  out.push("begin");

  for (const r of sheet.rows) {
    out.push("");
    out.push(`  -- ${r.firstName} ${r.lastName} · ${r.quantity} ${r.type} · $${r.value}`);
    // La clave incluye cantidad y total, no sólo el email: en la planilla hay
    // mails repetidos con COMPRAS DISTINTAS (alguien que compró para otro), y
    // deduplicando sólo por email se perdía una de las dos sin avisar.
    out.push("  select id into v_delivery from public.ticket_deliveries");
    out.push(`   where event_id = v_event and lower(email) = ${q(r.email)}`);
    out.push(`     and quantity = ${r.quantity} and value = ${r.value};`);
    out.push("  if v_delivery is not null then");
    out.push(
      `    raise notice 'Ya estaba cargada, la salteo: % (% x $%)', ${q(r.email)}, ${r.quantity}, ${r.value};`
    );
    out.push("  else");
    out.push("    insert into public.ticket_deliveries");
    out.push("      (event_id, first_name, last_name, email, phone, quantity, value, status, notes)");
    out.push(
      `    values (v_event, ${q(r.firstName)}, ${q(r.lastName)}, ${q(r.email)}, ${q(r.phone)}, ` +
        `${r.quantity}, ${r.value}, ${r.sent ? "'sent'" : "'pending'"}, ${q(r.notes)})`
    );
    out.push("    returning id into v_delivery;");
    out.push("");
    out.push(`    select id into v_type from public.ticket_types where lower(name) = ${q(r.type.toLowerCase())};`);
    out.push("    if v_type is not null then");
    out.push("      insert into public.delivery_ticket_types (delivery_id, ticket_type_id, quantity, unit_price)");
    out.push(`      values (v_delivery, v_type, ${r.quantity}, ${r.unitPrice})`);
    out.push("      on conflict (delivery_id, ticket_type_id) do nothing;");
    out.push("    else");
    out.push(`      raise notice 'Falta el tipo de entrada % en ticket_types', ${q(r.type)};`);
    out.push("    end if;");
    out.push("  end if;");
  }

  out.push("end $$;");
  out.push("");
}

out.push("-- Las importadas como 'sent' quedan con sent_at en null a propósito: no");
out.push("-- sabemos de qué día fue el envío, y poner la fecha de la importación diría");
out.push("-- que se enviaron hoy. En la lista se ven como enviadas, con la fecha en '—'.");
out.push("");
out.push("commit;");
out.push("");
out.push("-- ════════════════════════════════════════════════════════════════════════════");
out.push(`-- Resumen: ${total} fila/s en ${sheets.length} hoja/s.`);
for (const s of sheets) {
  const sent = s.rows.filter((r) => r.sent).length;
  out.push(`--   · ${s.name}: ${s.rows.length} (${sent} enviadas, ${s.rows.length - sent} por enviar)`);
}
if (problems.length) {
  out.push("--");
  out.push("-- Avisos del conversor:");
  for (const p of problems) out.push(`--   · ${p}`);
}
out.push("-- ════════════════════════════════════════════════════════════════════════════");

console.log(out.join("\n"));

// Los avisos también van a stderr, para verlos aunque se redirija la salida.
if (problems.length) {
  console.error(`\n${problems.length} aviso/s:`);
  for (const p of problems) console.error(`  · ${p}`);
}
console.error(`\n${total} fila/s en ${sheets.length} hoja/s.`);
