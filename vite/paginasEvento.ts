import fs from "fs";
import path from "path";
import type { Plugin } from "vite";
import { RUTA_EVENTO, SITIO } from "../src/lib/rutas";
import { imagenRedimensionada } from "../src/lib/imagenes";

/**
 * Páginas por evento (v25). Vive fuera de `vite.config.ts` por dos motivos:
 * ese archivo ya pasa las 500 líneas, y sobre todo porque la parte delicada de
 * acá —las sustituciones sobre el HTML ya construido— **se puede probar**, y
 * para eso `htmlDeEvento` tiene que ser importable.
 *
 * Que se pueda probar no es un lujo: el historial del proyecto tiene una
 * inyección en el HTML que no fallaba, simplemente no aparecía (el `<noscript>`
 * que terminaba dentro de un comentario, §6.8). Una sustitución que no encuentra
 * su ancla es silenciosa por naturaleza.
 */
export interface EventoPagina {
  slug: string;
  name: string;
  date: string;
  location: string;
  description: string;
  image_url: string;
  status: string;
  instagram_url?: string;
  event_ticket_types?: Array<{ price: number; active: boolean }>;
}

/** Para meter texto dentro de un atributo HTML sin romper la etiqueta. */
const attr = (s: string) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** Para meter texto entre etiquetas. */
const texto = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Reemplaza una etiqueta `<meta>` buscándola por su atributo, sin depender de
 * cómo esté formateada.
 *
 * El `index.html` tiene algunas en una línea y otras partidas en cuatro, así
 * que un patrón del tipo `<meta\s+property="og:title"` sólo encuentra la mitad.
 * El lookahead mira el atributo **en cualquier parte** de la etiqueta y
 * `[^>]*` cruza los saltos de línea (a diferencia de `.`).
 *
 * Avisa si no encuentra el ancla, por la misma razón que `bakeEventos`: una
 * inyección que no pasa y no dice nada es un bug que no se descubre hasta que
 * alguien comparte un link y ve el título equivocado.
 */
function cambiarMeta(
  html: string,
  clave: "name" | "property",
  nombre: string,
  contenido: string,
  avisos: string[]
): string {
  const re = new RegExp(`<meta(?=[^>]*\\b${clave}="${nombre}")[^>]*>`, "i");
  if (!re.test(html)) {
    avisos.push(`${clave}="${nombre}"`);
    return html;
  }
  return html.replace(re, `<meta ${clave}="${nombre}" content="${attr(contenido)}" />`);
}

/** Saca una `<meta>` entera (para las que no aplican a la página de un evento). */
function sacarMeta(html: string, clave: "name" | "property", nombre: string): string {
  return html.replace(
    new RegExp(`\\s*<meta(?=[^>]*\\b${clave}="${nombre}")[^>]*>`, "gi"),
    ""
  );
}

/** Fecha ISO -> "31/10/2026", cortando el string (nunca `new Date`: pasa a UTC). */
const fechaCorta = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};

/**
 * El `index.html` del build, adaptado a un evento.
 *
 * Todo lo que NO se toca —el tema, el CSS crítico, el telón de arranque, los
 * scripts con hash— queda igual, que es justo el motivo de partir de este
 * archivo en vez de armar uno nuevo.
 */
export function htmlDeEvento(base: string, e: EventoPagina): string {
  const avisos: string[] = [];
  const urlEvento = `${SITIO}${RUTA_EVENTO}/${e.slug}`;
  const titulo = `${e.name} · ${fechaCorta(e.date)} · ${e.location} | ODÍSEA`;

  const activos = (e.event_ticket_types ?? []).filter((t) => t.active);
  const precio = activos.length ? Math.min(...activos.map((t) => t.price)) : null;

  // La descripción propia del evento si la hay; si no, una armada con los
  // datos, que es mejor que repetir la de la home en todas las páginas.
  const descripcion = (
    e.description?.trim() ||
    `${e.name} el ${fechaCorta(e.date)} en ${e.location}.` +
      (precio !== null ? ` Entradas desde $${precio}.` : "") +
      " Comprá por WhatsApp."
  )
    .replace(/\s+/g, " ")
    .slice(0, 300);

  // El flyer como imagen del preview: esto es lo que hace que compartir una
  // fecha por WhatsApp muestre la fiesta y no el logo.
  const flyer = e.image_url ? imagenRedimensionada(e.image_url, 1200) : "";

  let html = base;

  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${texto(titulo)}</title>`);
  html = cambiarMeta(html, "name", "description", descripcion, avisos);
  html = html.replace(
    /<link(?=[^>]*\brel="canonical")[^>]*>/i,
    `<link rel="canonical" href="${attr(urlEvento)}" />`
  );

  html = cambiarMeta(html, "property", "og:title", titulo, avisos);
  html = cambiarMeta(html, "property", "og:description", descripcion, avisos);
  html = cambiarMeta(html, "property", "og:url", urlEvento, avisos);
  html = cambiarMeta(html, "name", "twitter:title", titulo, avisos);
  html = cambiarMeta(html, "name", "twitter:description", descripcion, avisos);

  if (flyer) {
    html = cambiarMeta(html, "property", "og:image", flyer, avisos);
    html = cambiarMeta(html, "name", "twitter:image", flyer, avisos);
    html = cambiarMeta(html, "property", "og:image:alt", e.name, avisos);
    // Las medidas de la home (1200x630) son de una imagen apaisada hecha a
    // propósito; los flyers son verticales. Declarar una medida que no es la
    // real hace que WhatsApp recorte mal, así que se sacan y que el scraper
    // mida solo. Igual el tipo, que acá puede ser webp, jpeg o png según lo
    // que negocie quien la pida.
    html = sacarMeta(html, "property", "og:image:width");
    html = sacarMeta(html, "property", "og:image:height");
    html = sacarMeta(html, "property", "og:image:type");
  }

  /**
   * Los datos estructurados se REEMPLAZAN, no se agregan.
   *
   * `bakeEventos` ya dejó en el HTML de la home el `Organization` y un `Event`
   * por cada fecha. En la página de UNA fecha, tener las cuatro le dice a
   * Google que la página habla de las cuatro, que es exactamente lo que esta
   * página viene a arreglar.
   */
  const json = (o: unknown) => JSON.stringify(o).replace(/<\//g, "<\\/");
  const evento = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.name,
    startDate: e.date,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    url: urlEvento,
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
            // Ahora sí apunta a la página de ESTE evento y no a la home.
            url: urlEvento,
            availability:
              e.status === "agotado"
                ? "https://schema.org/SoldOut"
                : "https://schema.org/InStock",
          },
        }
      : {}),
  };
  const organizacion = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "ODÍSEA",
    url: SITIO,
    logo: `${SITIO}/email-logo-white.png`,
    sameAs: ["https://www.instagram.com/odisea.uy"],
  };

  let primero = true;
  html = html.replace(
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/gi,
    () => {
      if (!primero) return "";
      primero = false;
      return (
        `<script type="application/ld+json">${json(evento)}</script>\n` +
        `    <script type="application/ld+json">${json(organizacion)}</script>`
      );
    }
  );

  /**
   * El `<noscript>` de contenido también se reemplaza: el que dejó
   * `bakeEventos` lista TODAS las fechas, y acá va el texto de ésta — lo único
   * que encuentra un extractor que no ejecuta JavaScript.
   */
  const bloqueNoscript =
    `<noscript><h1>${texto(e.name)}</h1>` +
    `<p>${texto(fechaCorta(e.date))} · ${texto(e.location)}` +
    (precio !== null ? ` · entradas desde $${precio}` : "") +
    `</p>` +
    (e.description ? `<p>${texto(e.description)}</p>` : "") +
    `<p><a href="${SITIO}/">Ver todas las fechas de ODÍSEA</a></p></noscript>`;

  /**
   * **Se ancla a `#root`, NO al primer `<noscript>` del documento.**
   *
   * Hay DOS en la página y el primero no es el de contenido: arriba, en el
   * `<head>`, está la hoja de estilos bloqueante que queda para quien tiene
   * JavaScript apagado (§6.6). El primer intento reemplazaba "el primero" y por
   * lo tanto **pisaba el del CSS**: dejaba a ese visitante sin estilos y metía
   * un `<h1>` dentro del `<head>`.
   *
   * No fallaba nada y el archivo se veía bien; lo encontró la prueba al contar
   * cuántos `<noscript>` quedaban. Es la misma forma de falla que el
   * `.replace("<body>", …)` de §6.8.
   */
  const anclaRoot = /(<div id="root"><\/div>)\s*(?:<noscript>[\s\S]*?<\/noscript>)?/i;
  if (anclaRoot.test(html)) {
    html = html.replace(anclaRoot, (_m, root: string) => `${root}\n    ${bloqueNoscript}`);
  } else {
    avisos.push("#root");
  }

  if (avisos.length) {
    console.warn(`[eventos] ${e.slug}: no encontré ${avisos.join(", ")}`);
  }
  return html;
}

/**
 * Un archivo HTML de verdad por evento, en `/evento/<slug>/index.html` (v25).
 *
 * **Por qué hace falta, si la ruta de React ya existe.** La página funciona sin
 * esto: `/evento/x` entra por el rewrite de la SPA y React la arma leyendo
 * Supabase. Eso le alcanza a una persona y le alcanza a un anuncio. Pero
 * **WhatsApp, Instagram y Facebook no ejecutan JavaScript**: leen el HTML crudo
 * y se quedan con lo que diga el `<head>`. Sin un archivo por evento, compartir
 * cualquier fecha muestra el mismo título y el mismo logo genérico — y el sitio
 * vende por WhatsApp.
 *
 * **Corre en `closeBundle` y lee `dist/index.html` del disco**, en vez de
 * engancharse a `transformIndexHtml`. El motivo es que necesita el HTML
 * **terminado**: con el tema escrito por `bakeTheme`, el CSS crítico, la hoja
 * ya pasada a no bloqueante y los `<script>` con el hash del build. En
 * `closeBundle` todo eso ya está escrito; engancharse antes significaría
 * depender del orden de los plugins.
 *
 * **Falla en silencio**, como `bakeTheme` y `bakeEventos`: si Supabase no
 * contesta, no se emite ninguna página y el sitio queda igual que antes. Las
 * URLs siguen andando por el rewrite; lo único que no se actualiza es el
 * preview. Un deploy no se cae porque no se pudo listar una fiesta.
 *
 * > **El precio, y es el mismo de siempre:** los datos son del último deploy.
 * > Una fecha cargada hoy tiene página hoy, pero su preview muestra el logo
 * > genérico hasta el próximo build. Por eso el panel tiene el botón
 * > "Actualizar páginas", que dispara un Deploy Hook de Vercel.
 */
export function paginasDeEventos(url?: string, key?: string): Plugin {
  // Lo completa `configResolved` antes de que corra `closeBundle`.
  let salida = "";
  return {
    name: "odisea-paginas-de-eventos",
    apply: "build",
    configResolved(config) {
      salida = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      if (!url || !key) return;
      const dist = salida;
      const indexPath = path.join(dist, "index.html");
      if (!fs.existsSync(indexPath)) {
        console.warn("[eventos] no encontré dist/index.html: no se emite ninguna página");
        return;
      }

      try {
        const res = await fetch(
          `${url}/rest/v1/events?select=slug,name,date,location,description,image_url,status,instagram_url,event_ticket_types(price,active)&order=date.asc`,
          {
            headers: { apikey: key, Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(8000),
          }
        );
        if (!res.ok) {
          console.warn(`[eventos] Supabase respondió ${res.status}: no se emite ninguna página`);
          return;
        }
        const filas = (await res.json()) as EventoPagina[];

        // Se publica página para TODOS los eventos que tengan slug, incluso los
        // que ya pasaron. Un link repartido no deja de existir porque la fiesta
        // terminó, y una página que dice "esa fecha ya pasó" es mejor que un
        // 404 — sobre todo si quedó pegado en un anuncio o en un chat. Lo que
        // sí se deja afuera del sitemap es lo viejo (más abajo).
        const conSlug = filas.filter((e) => e.slug);
        if (conSlug.length === 0) {
          console.warn("[eventos] ningún evento tiene slug: ¿falta correr v25_event_slug.sql?");
          return;
        }

        const base = fs.readFileSync(indexPath, "utf8");
        let escritas = 0;

        for (const e of conSlug) {
          const html = htmlDeEvento(base, e);
          const carpeta = path.join(dist, "evento", e.slug);
          fs.mkdirSync(carpeta, { recursive: true });
          fs.writeFileSync(path.join(carpeta, "index.html"), html);
          escritas++;
        }

        // El sitemap se REESCRIBE acá, encima del que ya emitió `seoEstatico`.
        // Se hace así y no moviéndolo entero para que el sitemap base
        // sobreviva si esta consulta falla: es preferible un sitemap con tres
        // rutas que ningún sitemap.
        const hoy = new Date().toISOString().slice(0, 10);
        const vigentes = conSlug.filter((e) => e.date >= hoy && e.status !== "finalizado");
        const rutas = [
          { loc: "/", priority: "1.0" },
          ...vigentes.map((e) => ({ loc: `${RUTA_EVENTO}/${e.slug}`, priority: "0.8" })),
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
        fs.writeFileSync(path.join(dist, "sitemap.xml"), xml);

        console.log(
          `[eventos] ${escritas} página(s) emitidas · sitemap con ${rutas.length} rutas ` +
            `(${vigentes.length} fecha(s) vigente(s))`
        );
      } catch (err) {
        console.warn(
          `[eventos] no se pudieron leer los eventos (${(err as Error).message}). ` +
            `Las URLs siguen andando por el rewrite, sin preview propio.`
        );
      }
    },
  };
}
