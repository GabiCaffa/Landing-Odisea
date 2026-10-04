import { useEffect, useState } from "react";
import Hero from "./Hero";
import HeroBanners from "./HeroBanners";
import { useHeroModo } from "@/contexts/ThemeContext";
import { SiteBanner, fetchBannersActivos } from "@/lib/banners";

/**
 * Elige qué hero pinta la home: el de siempre o el slider de banners (v27).
 *
 * Existe para que `Index.tsx` siga diciendo `<HeroDelSitio />` y nada más. El
 * interruptor vive en la base (`site_settings.hero`), así que esto es una
 * decisión de ejecución, no de build.
 *
 * ─── El parpadeo, y hasta dónde se puede evitar ───────────────────────────
 *
 * El modo llega por red. Sin nada más, un visitante nuevo vería el hero
 * clásico y medio segundo después el slider — el mismo problema que el tema
 * tuvo en §6.3, y la misma mitad de la solución: el valor se cachea en
 * `localStorage` y en la visita siguiente se aplica antes de que llegue la
 * consulta.
 *
 * **Para el visitante NUEVO el parpadeo sigue existiendo**, y acá no se puede
 * arreglar: el dato no está en ninguna parte del cliente. El tema lo resolvió
 * horneándolo en el HTML en tiempo de build (`bakeTheme`); si alguna vez
 * molesta, ése es el molde, y hay que sumarle las URLs de los banners o el
 * slider igual aparecería vacío.
 *
 * Mientras tanto **el caso por defecto no parpadea**: sin la clave en la base
 * el modo es `clasico` y la home queda exactamente como está hoy.
 */

const CACHE_KEY = "odisea:hero";

const leerCache = (): boolean => {
  try {
    return localStorage.getItem(CACHE_KEY) === "banners";
  } catch {
    // Incógnito o storage bloqueado: se pierde sólo el anti-parpadeo.
    return false;
  }
};

const HeroDelSitio = () => {
  const modo = useHeroModo();
  const [banners, setBanners] = useState<SiteBanner[]>([]);
  // Lo que se cree antes de que conteste la base. Se lee una sola vez.
  const [optimista] = useState(leerCache);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(CACHE_KEY, modo);
    } catch {
      /* ver leerCache */
    }
  }, [modo]);

  // Los banners se piden si el modo —el real o el cacheado— dice que hacen
  // falta. Pedirlos siempre sería una consulta de más en la carga inicial para
  // todos los visitantes mientras el slider esté apagado.
  useEffect(() => {
    if (modo !== "banners" && !optimista) return;
    let cancelado = false;
    fetchBannersActivos().then((b) => {
      if (cancelado) return;
      setBanners(b);
      setCargado(true);
    });
    return () => {
      cancelado = true;
    };
  }, [modo, optimista]);

  // Con el slider prendido pero sin banners cargados —o si la consulta
  // falló— va el hero de siempre. Una home que arranca con un hueco blanco
  // es peor que una que arranca como arrancaba.
  if (modo === "banners" && cargado && banners.length > 0) {
    return <HeroBanners banners={banners} />;
  }

  return <Hero />;
};

export default HeroDelSitio;
