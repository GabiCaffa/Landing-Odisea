import type { AdminEvent } from "@/contexts/AuthContext";
import { foldText } from "@/lib/utils";

/**
 * Fiestas "aparte": las que NO son parte de la temporada del sitio.
 *
 * El sitio entero se viste del tema estacional (Halloween, §6.3), pero ODÍSEA
 * también hace fechas que no tienen nada que ver con él —la Expo Fiesta—. Esas
 * fechas no van en el carrusel de Próximos Eventos, entre las de la temporada,
 * sino en su propia página, y esa página **no lleva el tema**.
 *
 * ─── Cómo se reconoce una ───────────────────────────────────────────────
 *
 * Por el NOMBRE (del evento, de la fiesta o su clave de grupo): si contiene
 * alguna de `PALABRAS_APARTE`, es aparte. Es lo que se eligió para no pedir una
 * migración —no hay que correr nada en Supabase—, y tiene un costo que conviene
 * tener presente: **si una fiesta se carga con otro nombre, no se detecta y
 * queda en el carrusel con el tema**. Falla hacia el lado inofensivo (la tarjeta
 * sigue donde estaba), pero hay que acordarse al cargarla.
 *
 * Si algún día son varias o el nombre deja de alcanzar, el reemplazo natural es
 * una columna en `events` editable desde el panel; `esFiestaAparte` es el único
 * lugar que lo sabe, así que el cambio queda acá.
 *
 * Para sumar otra fiesta de este tipo: agregar su palabra clave abajo.
 */
export const PALABRAS_APARTE = ["expo"];

/** La página de la fiesta aparte. Es la URL que va en anuncios y banners. */
export const RUTA_APARTE = "/expofiesta";

export const esFiestaAparte = (e: AdminEvent): boolean => {
  const texto = foldText(`${e.name} ${e.groupName ?? ""} ${e.groupKey ?? ""}`);
  return PALABRAS_APARTE.some((p) => texto.includes(p));
};

/**
 * La fiesta aparte vigente, o `undefined` si no hay ninguna.
 *
 * Si hay más de una, la primera por fecha que todavía no pasó: la próxima es la
 * que importa. Los finalizados no cuentan —un acceso a una fecha que ya fue es
 * peor que no tener acceso—.
 */
export const fiestaAparte = (events: AdminEvent[]): AdminEvent | undefined =>
  events
    .filter((e) => e.status !== "finalizado" && esFiestaAparte(e))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
