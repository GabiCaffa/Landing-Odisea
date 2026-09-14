import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

/**
 * Escribe el tema activo directamente en el <html> del build.
 *
 * El problema que resuelve: el tema vive en la base (site_settings, v19) y por
 * lo tanto viaja por red. El script de index.html lo aplica apenas puede, pero
 * para quien entra **por primera vez** no hay nada cacheado y el valor tarda
 * ~600ms en llegar: ese tiempo la persona ve la paleta clara y después salta a
 * la oscura. Ningún truco del lado del cliente lo evita, porque el dato todavía
 * no está.
 *
 * Con esto el valor ya viene en el HTML que sirve Vercel: el primer cuadro sale
 * correcto sin depender de ninguna red. En tiempo de ejecución, localStorage y
 * la consulta a Supabase lo siguen pisando, así que si el tema se cambia desde
 * el panel **sin** volver a deployar, todo sigue funcionando — lo único que
 * pierde ese caso es el arranque perfecto del visitante nuevo, hasta el próximo
 * deploy.
 *
 * Falla en silencio a propósito: si Supabase no contesta durante el build, no
 * se inyecta nada y el sitio se comporta como antes. Un deploy no se cae porque
 * no se pudo averiguar un color.
 */
function bakeTheme(url?: string, key?: string): Plugin {
  return {
    name: "odisea-bake-theme",
    apply: "build",
    async transformIndexHtml(html) {
      if (!url || !key) return html;
      try {
        const res = await fetch(
          `${url}/rest/v1/site_settings?select=value&key=eq.theme`,
          {
            headers: { apikey: key, Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(8000),
          }
        );
        if (!res.ok) return html;
        const rows = (await res.json()) as Array<{ value?: unknown }>;
        const theme = rows?.[0]?.value;
        // 'base' es la ausencia del atributo: no hay nada que escribir.
        if (typeof theme !== "string" || theme === "base" || !/^[a-z-]{1,32}$/.test(theme)) {
          console.log(`[tema] queda en 'base', sin atributo en el HTML`);
          return html;
        }
        console.log(`[tema] '${theme}' escrito en el <html> del build`);
        return html.replace("<html lang=\"es\">", `<html lang="es" data-theme="${theme}">`);
      } catch (err) {
        console.warn(
          `[tema] no se pudo leer el tema para el build (${(err as Error).message}). ` +
            `El sitio lo va a resolver por red, como antes.`
        );
        return html;
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
      bakeTheme(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
