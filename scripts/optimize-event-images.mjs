// ════════════════════════════════════════════════════════════════════════════
// Re-comprime y re-sube las imágenes de eventos ya cargadas en Supabase.
// ════════════════════════════════════════════════════════════════════════════
//
// Qué hace:
//   1. Inicia sesión con una cuenta ADMIN (necesario por el RLS del bucket).
//   2. Lee todos los eventos con imagen.
//   3. Descarga cada imagen, la redimensiona a 800px de ancho y la guarda como
//      JPEG calidad 0.8 (mismo criterio que las subidas nuevas de la app).
//   4. Sube la versión optimizada y actualiza events.image_url.
//   5. Borra el archivo viejo (best-effort).
//
// Uso (PowerShell):
//   $env:ADMIN_EMAIL="tu@email.com"; $env:ADMIN_PASSWORD="tu_password"; node scripts/optimize-event-images.mjs
//
//   # Para ver qué haría sin tocar nada, agregá --dry-run:
//   $env:ADMIN_EMAIL="..."; $env:ADMIN_PASSWORD="..."; node scripts/optimize-event-images.mjs --dry-run
//
// Las credenciales se leen de variables de entorno: NO quedan en el código ni en git.
// ════════════════════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { readFileSync } from "node:fs";

// ─── Config ─────────────────────────────────────────────────────────────────
const BUCKET = "event-images";
const MAX_WIDTH = 800;
const QUALITY = 80;
const DRY_RUN = process.argv.includes("--dry-run");

// Lee VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY del archivo .env
function readEnv() {
  let raw = "";
  try {
    raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
  } catch {
    fail("No se encontró el archivo .env en la raíz del proyecto.");
  }
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([\w]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

const fmtKB = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const env = readEnv();
  const url = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!url || !anonKey) fail("Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en .env");
  // El dry-run sólo lee (eventos públicos + imágenes públicas), no necesita admin.
  // La escritura real (upload + update) sí requiere sesión admin por el RLS.
  if (!DRY_RUN && (!email || !password))
    fail("Definí las variables ADMIN_EMAIL y ADMIN_PASSWORD antes de correr el script.");

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Login admin (sólo si vamos a escribir)
  if (!DRY_RUN) {
    console.log(`🔑 Iniciando sesión como ${email}...`);
    const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (authErr || !auth.user) fail(`No se pudo iniciar sesión: ${authErr?.message ?? "desconocido"}`);
  }

  // 2. Traer eventos con imagen
  const { data: events, error: evErr } = await supabase
    .from("events")
    .select("id, name, image_url")
    .not("image_url", "is", null);
  if (evErr) fail(`Error leyendo eventos: ${evErr.message}`);

  const withImage = events.filter((e) => e.image_url);
  console.log(`\n📅 ${withImage.length} evento(s) con imagen.${DRY_RUN ? "  (DRY-RUN: no se modifica nada)" : ""}\n`);

  let totalBefore = 0;
  let totalAfter = 0;

  for (const ev of withImage) {
    const oldPath = ev.image_url.split(`/${BUCKET}/`)[1]?.split("?")[0];
    if (!oldPath) {
      console.log(`⏭️  ${ev.name}: no pude parsear la ruta de "${ev.image_url}", salto.`);
      continue;
    }

    // Descargar bytes actuales
    const resp = await fetch(ev.image_url);
    if (!resp.ok) {
      console.log(`⏭️  ${ev.name}: no se pudo descargar la imagen (HTTP ${resp.status}), salto.`);
      continue;
    }
    const inputBuf = Buffer.from(await resp.arrayBuffer());

    // Re-comprimir
    const outputBuf = await sharp(inputBuf)
      .rotate() // respeta orientación EXIF
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: QUALITY })
      .toBuffer();

    totalBefore += inputBuf.length;

    // Si no hay ahorro real, no vale la pena re-subir
    if (outputBuf.length >= inputBuf.length) {
      totalAfter += inputBuf.length;
      console.log(`✅ ${ev.name}: ya está optimizada (${fmtKB(inputBuf.length)}), salto.`);
      continue;
    }
    totalAfter += outputBuf.length;

    const pct = (100 * (1 - outputBuf.length / inputBuf.length)).toFixed(0);
    console.log(`🖼️  ${ev.name}: ${fmtKB(inputBuf.length)} → ${fmtKB(outputBuf.length)}  (-${pct}%)`);

    if (DRY_RUN) continue;

    // Subir versión nueva a una ruta nueva
    const newPath = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(newPath, outputBuf, { contentType: "image/jpeg", upsert: false });
    if (upErr) {
      console.log(`   ⚠️  Error subiendo: ${upErr.message}. Salto este evento.`);
      continue;
    }

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(newPath);

    // Actualizar el evento
    const { error: updErr } = await supabase
      .from("events")
      .update({ image_url: pub.publicUrl })
      .eq("id", ev.id);
    if (updErr) {
      console.log(`   ⚠️  Subí la imagen pero falló el update del evento: ${updErr.message}`);
      await supabase.storage.from(BUCKET).remove([newPath]); // limpio el huérfano
      continue;
    }

    // Borrar la imagen vieja (best-effort)
    await supabase.storage.from(BUCKET).remove([oldPath]);
    console.log(`   ✔ actualizado.`);
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Total: ${fmtKB(totalBefore)} → ${fmtKB(totalAfter)}`);
  if (totalBefore > 0) {
    const pct = (100 * (1 - totalAfter / totalBefore)).toFixed(0);
    console.log(`Ahorro: ${fmtKB(totalBefore - totalAfter)}  (-${pct}%)`);
  }
  console.log(DRY_RUN ? `(DRY-RUN: no se modificó nada)\n` : `Listo.\n`);

  await supabase.auth.signOut();
}

main().catch((e) => fail(e.message ?? String(e)));
