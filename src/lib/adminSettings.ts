import { supabase } from "@/lib/supabase";

/**
 * Ajustes del panel que el público NO puede leer (v25).
 *
 * Separado de `site_settings` (v19) a propósito: esa tabla es de **lectura
 * pública** porque la landing tiene que saber qué tema pintar antes de que
 * nadie inicie sesión. Acá va lo que no puede salir del staff.
 */

/** URL del Deploy Hook de Vercel que reconstruye el sitio. */
export const CLAVE_DEPLOY_HOOK = "vercel_deploy_hook";

export async function fetchAdminSetting(key: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("admin_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  // Sin permiso o sin fila dan lo mismo para quien llama: no hay valor.
  if (error || !data) return null;
  return data.value ?? null;
}

export async function saveAdminSetting(
  key: string,
  value: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("admin_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Dispara el Deploy Hook.
 *
 * **Va en `no-cors` y por lo tanto NO se puede saber si salió bien.** Los deploy
 * hooks de Vercel están pensados para llamarse desde un servidor y no mandan
 * cabeceras CORS, así que el navegador deja salir el POST pero no deja leer la
 * respuesta. El pedido llega igual y el build arranca; lo único que se pierde
 * es la confirmación, y mentir diciendo "listo" sería peor que avisarlo.
 *
 * La alternativa sería un proxy del lado del servidor, o sea el primer pedazo
 * de backend del proyecto, para ganar un cartel de confirmación.
 */
export async function dispararDeploy(hookUrl: string): Promise<{ enviado: boolean; error?: string }> {
  try {
    // Validación mínima: que sea una URL de Vercel. Evita mandar el pedido a
    // cualquier lado si alguien pegó algo que no era el hook.
    const u = new URL(hookUrl);
    if (!u.hostname.endsWith("vercel.com")) {
      return { enviado: false, error: "La URL no parece un Deploy Hook de Vercel" };
    }
    await fetch(hookUrl, { method: "POST", mode: "no-cors" });
    return { enviado: true };
  } catch (e) {
    return { enviado: false, error: (e as Error).message };
  }
}
