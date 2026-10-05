import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import HeroBanners from "./HeroBanners";
import { SiteBanner, fetchBannersActivos } from "@/lib/banners";
import { playThud } from "@/lib/spookySound";
import { useAuth } from "@/contexts/AuthContext";
import { RUTA_APARTE, fiestaAparte } from "@/lib/fiestasAparte";

/**
 * El hero de la home: el slider de banners y, debajo, los dos accesos a
 * eventos y promociones.
 *
 * Antes había además un hero clásico (logo + tagline) y un interruptor en la
 * base (`site_settings.hero`) para elegir entre los dos. Se sacó: la web va
 * enfocada a la venta y lo primero que se ve tiene que ser la fecha que se
 * está vendiendo, no la marca. Para sumar o cambiar un banner no hay que
 * tocar código: se carga desde el panel.
 *
 * Los botones van chicos y DEBAJO del banner a propósito: el banner es el
 * contenido, los botones son atajos. El de eventos lleva el acento porque es
 * el camino a la compra.
 */
const HeroDelSitio = () => {
  const [banners, setBanners] = useState<SiteBanner[]>([]);
  const [cargado, setCargado] = useState(false);
  const { events } = useAuth();
  // Si hay una fiesta fuera de la temporada, se le da su acceso propio. Sin
  // ninguna vigente no se renderiza nada.
  const aparte = useMemo(() => fiestaAparte(events), [events]);

  useEffect(() => {
    let cancelado = false;
    fetchBannersActivos().then((b) => {
      if (cancelado) return;
      setBanners(b);
      setCargado(true);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  return (
    <>
      {banners.length > 0 ? (
        <HeroBanners banners={banners} />
      ) : (
        /*
         * Mientras la consulta no contesta se reserva el alto del banner, así
         * los botones y lo de abajo no saltan cuando llega (§6.4). Si contestó
         * y no hay ninguno activo, no queda hueco: sólo el despeje del header
         * —que es `fixed` y flota sobre el contenido— y los botones.
         */
        <div
          aria-hidden="true"
          className={`bg-secondary/40 pt-[69px] md:pt-[85px] ${
            cargado ? "" : "min-h-[calc(69px+125vw)] md:min-h-[calc(85px+31.25vw)]"
          }`}
        />
      )}

      <div className="bg-papel px-4 pb-2 pt-4 md:pt-5">
        <div className="mx-auto flex max-w-md items-center justify-center gap-3">
          <a
            href="#eventos"
            onClick={playThud}
            className="btn-celeste min-h-[44px] flex-1 px-4 py-2.5 text-xs sm:flex-none sm:px-6"
          >
            Ver eventos
          </a>
          <a
            href="#promos"
            onClick={playThud}
            className="btn-techno-outline min-h-[44px] flex-1 px-4 py-2.5 text-xs sm:flex-none sm:px-6"
          >
            Ver promociones
          </a>
        </div>

        {/* Acceso a la fiesta aparte (Expo): una línea propia bajo los dos
            atajos, en tinta para que no compita con el naranja de "Ver
            eventos". Lleva a /expofiesta, que no lleva el tema estacional. */}
        {aparte && (
          <Link
            to={RUTA_APARTE}
            onClick={playThud}
            className="btn-techno !flex mx-auto mt-3 min-h-[44px] w-full max-w-md px-4 py-2.5 text-xs"
          >
            <span className="truncate">{aparte.groupName || aparte.name}</span>
            <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          </Link>
        )}
      </div>
    </>
  );
};

export default HeroDelSitio;
