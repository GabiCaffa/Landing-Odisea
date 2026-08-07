import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    "Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en el archivo .env"
  );
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const EVENT_IMAGES_BUCKET = "event-images";

/**
 * Fotos de documento de la promo cumpleaños. Bucket PRIVADO: se accede sólo con
 * URLs firmadas y sesión de staff (ver supabase/v12_birthday_signups.sql).
 */
export const ID_PHOTOS_BUCKET = "id-photos";
