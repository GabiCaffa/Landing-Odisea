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

        /**
         * Ya que el build sabe qué tema va, aprovecha para dos cosas más que
         * atacan el "blanco al principio":
         *
         * 1. `theme-color`. En Android, Chrome pinta su propia barra con este
         *    valor. Sin él queda clara aunque el sitio sea oscuro, y eso es
         *    parte de lo que se lee como "aparece blanco primero".
         * 2. `preload` del logo del telón. Es un `background-image` del CSS
         *    crítico, así que el navegador recién lo descubre cuando calcula
         *    estilos — medido: el pedido salía a los 240 ms, después del CSS.
         *    Con el preload arranca junto con todo lo demás.
         *
         * Los dos dependen del tema, y el tema sólo se conoce acá.
         */
        const oscuro = theme === "halloween";
        const extras =
          `<meta name="theme-color" content="${oscuro ? "#0B1D22" : "#FFFFFF"}">\n    ` +
          `<link rel="preload" as="image" href="/email-logo-${oscuro ? "white" : "black"}.png">\n    `;

        return html
          .replace("<html lang=\"es\">", `<html lang="es" data-theme="${theme}">`)
          .replace("<meta charset=\"UTF-8\" />", `<meta charset="UTF-8" />\n    ${extras}`);
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

/**
 * La hoja de estilos de la app deja de bloquear el primer pintado.
 *
 * **El problema que resuelve, medido.** Un `<link rel="stylesheet">` en el
 * `<head>` bloquea el render: el navegador no pinta NADA hasta tenerlo. Eso
 * incluía al `<style>` crítico y al telón de `#arranque`, que justamente están
 * para que se vea algo enseguida. O sea que la pantalla quedaba en blanco
 * durante toda la descarga de 91 KB de CSS — rápido en escritorio, lento en un
 * celular con datos móviles, que es exactamente la diferencia que se reportó.
 *
 * La pista que lo confirmó: el logo del telón, que es un `background-image` del
 * CSS crítico, recién se pedía a los **240 ms**, después de que la hoja externa
 * terminara a los 211. Si el CSS inline hubiera podido pintar por su cuenta, ese
 * pedido habría salido con el parseo del HTML.
 *
 * **El truco.** `media="print"` hace que el navegador lo baje sin bloquear (no
 * aplica a pantalla); al terminar, `onload` lo pasa a `all` y se aplica. Es el
 * patrón estándar para CSS no crítico.
 *
 * **Por qué no rompe.** Entre que llega el CSS y que la app se ve hay muchísimo
 * margen: la hoja son 91 KB y el JavaScript que monta React son ~574 KB, así que
 * el CSS gana siempre por varios cuerpos. Y además hay dos redes de contención:
 * el telón tapa la pantalla hasta que React monta, y `OcultarArranque` **espera
 * explícitamente** a que la hoja esté aplicada antes de levantarlo. El
 * `<noscript>` cubre a quien tenga JavaScript apagado, para el que el `onload`
 * nunca corre.
 */
function cssNoBloqueante(): Plugin {
  return {
    name: "odisea-css-no-bloqueante",
    apply: "build",
    transformIndexHtml: {
      // 'post': tiene que correr DESPUÉS de que Vite inyecte sus propias
      // etiquetas, que es lo que se está reescribiendo.
      order: "post",
      handler(html) {
        const re = /<link rel="stylesheet"([^>]*?)href="([^"]+)"([^>]*)>/g;
        let encontradas = 0;
        const salida = html.replace(re, (_m, antes, href, despues) => {
          encontradas++;
          const attrs = `${antes}href="${href}"${despues}`.trim();
          return (
            `<link rel="stylesheet" ${attrs.replace(/^rel="stylesheet"\s*/, "")} ` +
            `id="css-app" media="print" onload="this.media='all'">` +
            `<noscript><link rel="stylesheet" ${attrs}></noscript>`
          );
        });
        if (!encontradas) {
          console.warn("[css] no encontré la hoja de estilos: queda bloqueando el render, como antes");
          return html;
        }
        console.log(`[css] ${encontradas} hoja(s) pasan a no bloquear el primer pintado`);
        return salida;
      },
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
      cssNoBloqueante(),
    ].filter(Boolean),
    build: {
      rollupOptions: {
        output: {
          /**
           * Se separan las librerías grandes en chunks propios.
           *
           * Dos motivos. Uno de diagnóstico: con todo en un solo archivo de
           * 741 KB no hay forma de saber qué pesa. Y uno de caché: ahora que
           * /assets/ va con "immutable" a un año, el código de terceros —que
           * cambia cuando se actualiza una dependencia, o sea casi nunca— deja
           * de invalidarse cada vez que se toca una línea del sitio.
           */
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return;
            if (id.includes('@supabase')) return 'supabase';
            // lottie-web queda FUERA de todo grupo, con un return vacío.
            //
            // No alcanza con no nombrarlo: sin esta línea cae en el return
            // "vendor" de abajo, y vendor SÍ se precarga — la decoración se
            // colaba en la carga inicial escondida ahí (medido: vendor pasó de
            // 49 a 128 KB). Devolviendo undefined, Rollup lo trata como lo que
            // es: el chunk del import() dinámico, que sólo baja cuando se pide.
            if (id.includes('lottie-web')) return;
            if (id.includes('libphonenumber')) return 'telefono';
            if (id.includes('recharts') || id.includes('d3-')) return 'graficos';
            if (id.includes('@radix-ui')) return 'radix';
            if (id.includes('react-router')) return 'router';
            // React va aparte y JUNTO: separar react de react-dom o del
            // scheduler rompe el orden de inicialización.
            if (/[\/]node_modules[\/](react|react-dom|scheduler)[\/]/.test(id)) return 'react';
            return 'vendor';
          },
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
