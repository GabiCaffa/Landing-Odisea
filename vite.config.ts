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

const SITIO = "https://www.odiseaoficial.com";

interface EventoDb {
  name: string;
  date: string;
  location: string;
  description: string;
  image_url: string;
  status: string;
  event_ticket_types?: Array<{ price: number; active: boolean }>;
}

/**
 * Escribe los eventos en el HTML del build como datos estructurados.
 *
 * **El problema que resuelve, verificado en Google real.** El sitio ya sale
 * PRIMERO en "odisea fiesta" y "odisea oficial", así que posicionar no era el
 * problema. Lo que pasaba es otra cosa: el resumen de IA de Google armaba las
 * "Próximas Fechas" de ODÍSEA citando **Instagram y MiEntrada**, no el sitio
 * propio — y en esa misma búsqueda MiEntrada aparecía segundo mostrando fecha,
 * hora y lugar. Google ya sabía las fechas, pero las aprendía de terceros.
 *
 * El motivo es el de siempre: esto es una SPA y el `<body>` que recibe un bot
 * es `<div id="root">` vacío. Google ejecuta JavaScript, pero tarde y sin
 * garantías; WhatsApp, Instagram y Facebook directamente no lo ejecutan.
 *
 * Se hornea en el build y no se inyecta desde React por eso mismo: para que el
 * dato esté en el HTML que llega, sin depender de que alguien ejecute nada.
 * Se usa el mismo molde que `bakeTheme` —consultar Supabase en tiempo de
 * build— porque ya estaba resuelto y probado.
 *
 * **Falla en silencio**, igual que `bakeTheme`: si Supabase no contesta durante
 * el build, no se inyecta nada y el sitio queda como estaba. Un deploy no se
 * cae porque no se pudo listar una fiesta.
 *
 * > **El precio: los datos son del último deploy.** Los eventos se editan desde
 * > el panel sin redeployar, así que un evento nuevo no aparece acá hasta el
 * > próximo push. Es aceptable —las fechas se cargan con semanas de
 * > anticipación y cualquier cambio de código redeploya— y la alternativa
 * > (inyectarlo desde React) no lo verían ni WhatsApp ni Instagram.
 */
function bakeEventos(url?: string, key?: string): Plugin {
  return {
    name: "odisea-bake-eventos",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      async handler(html) {
        if (!url || !key) return html;
        try {
          const res = await fetch(
            `${url}/rest/v1/events?select=name,date,location,description,image_url,status,event_ticket_types(price,active)&order=date.asc`,
            {
              headers: { apikey: key, Authorization: `Bearer ${key}` },
              signal: AbortSignal.timeout(8000),
            }
          );
          if (!res.ok) return html;
          const filas = (await res.json()) as EventoDb[];

          // Sólo lo que todavía no pasó y sigue a la venta. Un evento
          // "finalizado" en los datos estructurados es peor que no tener nada:
          // Google muestra una fecha vieja como si fuera la próxima.
          const hoy = new Date().toISOString().slice(0, 10);
          const vigentes = filas.filter(
            (e) => e.date >= hoy && e.status !== "finalizado"
          );
          if (vigentes.length === 0) {
            console.log("[seo] sin eventos vigentes: no se inyecta nada");
            return html;
          }

          const precioDesde = (e: EventoDb) => {
            const activos = (e.event_ticket_types ?? []).filter((t) => t.active);
            return activos.length ? Math.min(...activos.map((t) => t.price)) : null;
          };

          const eventos = vigentes.map((e) => {
            const precio = precioDesde(e);
            return {
              "@context": "https://schema.org",
              "@type": "Event",
              name: e.name,
              startDate: e.date,
              // Sin esto Google avisa que faltan campos recomendados.
              eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
              // "Agotado" NO va acá: `eventStatus` es para cancelado, pospuesto
              // o movido. Un evento agotado sigue programado, y que no queden
              // entradas se dice en `offers.availability` (abajo).
              eventStatus: "https://schema.org/EventScheduled",
              location: {
                "@type": "Place",
                name: e.location,
                address: { "@type": "PostalAddress", addressCountry: "UY" },
              },
              ...(e.image_url ? { image: [e.image_url] } : {}),
              ...(e.description ? { description: e.description } : {}),
              organizer: { "@type": "Organization", name: "ODÍSEA", url: SITIO },
              ...(precio !== null
                ? {
                    offers: {
                      "@type": "Offer",
                      price: precio,
                      priceCurrency: "UYU",
                      url: SITIO,
                      availability:
                        e.status === "agotado"
                          ? "https://schema.org/SoldOut"
                          : "https://schema.org/InStock",
                    },
                  }
                : {}),
            };
          });

          const organizacion = {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "ODÍSEA",
            url: SITIO,
            logo: `${SITIO}/email-logo-white.png`,
            description:
              "Productora de eventos de música electrónica en Uruguay (Colonia del Sacramento, Paysandú y Nueva Helvecia).",
            areaServed: { "@type": "Country", name: "Uruguay" },
            sameAs: ["https://www.instagram.com/odisea.uy"],
          };

          // `</` dentro de un <script> cierra la etiqueta aunque esté adentro de
          // un string JSON. Escaparlo es obligatorio, no una precaución.
          const json = (o: unknown) => JSON.stringify(o).replace(/<\//g, "<\\/");

          const bloques = [organizacion, ...eventos]
            .map((o) => `    <script type="application/ld+json">${json(o)}</script>`)
            .join("\n");

          /**
           * Además del JSON-LD, una lista en `<noscript>` con las fechas.
           *
           * El JSON-LD es para el buscador; esto es texto de verdad, para
           * cualquier bot que sólo extraiga contenido. Hasta ahora lo único que
           * se podía extraer de la home eran los comentarios del código.
           * `<noscript>` porque para una persona con JavaScript es contenido
           * duplicado del hero.
           */
          const texto = vigentes
            .map((e) => {
              const [a, m, d] = e.date.split("-");
              const precio = precioDesde(e);
              return `<li>${e.name} — ${d}/${m}/${a} — ${e.location}${
                precio !== null ? ` — desde $${precio}` : ""
              }</li>`;
            })
            .join("");
          const noscript =
            `    <noscript><h1>ODÍSEA · Fiestas y eventos en Uruguay</h1>` +
            `<p>Productora de eventos en Colonia del Sacramento, Paysandú y Nueva Helvecia.</p>` +
            `<h2>Próximas fechas</h2><ul>${texto}</ul></noscript>`;

          /**
           * Anclas ÚNICAS, y que avisan si no aparecen.
           *
           * El primer intento insertaba con `.replace("<body>", …)`, que
           * reemplaza la PRIMERA ocurrencia — y la primera `<body>` del fuente
           * está dentro de un comentario (el que explica el telón de arranque).
           * El `<noscript>` terminaba adentro del comentario y después
           * `seoEstatico` lo borraba junto con él. No fallaba: simplemente no
           * aparecía. Por eso ahora se ancla a `<div id="root"></div>`, que no
           * puede estar duplicado, y se avisa si el ancla no está.
           */
          const anclas: Array<[string, string]> = [
            ["</head>", `${bloques}\n  </head>`],
            ['<div id="root"></div>', `<div id="root"></div>\n${noscript}`],
          ];
          let salida = html;
          for (const [ancla, reemplazo] of anclas) {
            if (!salida.includes(ancla)) {
              console.warn(`[seo] no encontré el ancla ${ancla}: ese bloque no se inyecta`);
              continue;
            }
            salida = salida.replace(ancla, reemplazo);
          }

          console.log(`[seo] ${vigentes.length} evento(s) escritos en el HTML`);
          return salida;
        } catch (err) {
          console.warn(
            `[seo] no se pudieron leer los eventos para el build (${(err as Error).message}). ` +
              `El HTML sale sin datos estructurados, como antes.`
          );
          return html;
        }
      },
    },
  };
}

/**
 * Genera `sitemap.xml` y saca los comentarios del HTML publicado.
 *
 * **El sitemap no existía.** `/sitemap.xml` devolvía `text/html`: el rewrite de
 * la SPA (`vercel.json`) le sirve el index a cualquier ruta que no sea un
 * archivo real, así que Google pedía XML y recibía la página. Un archivo de
 * verdad en el output le gana al rewrite — igual que `robots.txt`, que sí
 * funciona porque está en `public/`.
 *
 * **Los comentarios del HTML se publican.** Vite no los borra, así que los
 * bloques que explican el telón de arranque y el script del tema viajaban en
 * cada carga. Peor: al ser el `<body>` una SPA vacía, esos comentarios eran
 * literalmente **el único texto** que un extractor encontraba en la home. Se
 * borran del build; en el fuente quedan, que es donde sirven.
 */
function seoEstatico(): Plugin {
  return {
    name: "odisea-seo-estatico",
    apply: "build",
    generateBundle() {
      const hoy = new Date().toISOString().slice(0, 10);
      // Sólo las rutas con contenido público. Login, registro y el panel no
      // van: no aportan nada en un buscador y no queremos indexarlos.
      const rutas = [
        { loc: "/", priority: "1.0" },
        { loc: "/terminos", priority: "0.3" },
        { loc: "/privacidad", priority: "0.3" },
      ];
      const xml =
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        rutas
          .map(
            (r) =>
              `  <url><loc>${SITIO}${r.loc}</loc><lastmod>${hoy}</lastmod>` +
              `<priority>${r.priority}</priority></url>`
          )
          .join("\n") +
        `\n</urlset>\n`;
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: xml });
      console.log(`[seo] sitemap.xml con ${rutas.length} rutas`);
    },
    transformIndexHtml: {
      // 'post' y después de todos los demás: se limpia lo que ya está armado.
      order: "post",
      handler(html) {
        const antes = html.length;
        const limpio = html
          // Comentarios HTML. No hay comentarios condicionales de IE acá.
          .replace(/<!--[\s\S]*?-->/g, "")
          // Comentarios CSS, sólo dentro de los <style> en línea. El único
          // `url(...)` del bloque crítico no contiene `/*`, así que no hay
          // riesgo de comerse parte de una regla.
          .replace(/<style>([\s\S]*?)<\/style>/g, (_m, css: string) =>
            `<style>${css.replace(/\/\*[\s\S]*?\*\//g, "")}</style>`
          )
          // Las líneas que quedaron vacías al sacar los comentarios.
          .replace(/^[ \t]*\n/gm, "");
        console.log(
          `[seo] HTML: ${(antes / 1024).toFixed(1)} KB -> ${(limpio.length / 1024).toFixed(1)} KB (sin comentarios)`
        );
        return limpio;
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
      bakeEventos(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY),
      cssNoBloqueante(),
      // Último: limpia el HTML ya armado por todos los anteriores.
      seoEstatico(),
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
            // lucide-react, por el MISMO motivo y con la misma forma de falla.
            //
            // Cada icono es un módulo suelto. Cayendo en "vendor" se juntaban
            // todos ahí, así que los ~40 que usa sólo el panel los descargaba
            // cualquiera que entrara a ver una fiesta — aunque `/admin` esté en
            // un chunk lazy. Sin agrupar, Rollup pone cada icono donde se usa:
            // los del sitio en el chunk del sitio, los del panel en el de Admin.
            if (id.includes('lucide-react')) return;
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
