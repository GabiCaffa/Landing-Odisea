import { Suspense, lazy, useEffect } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { tieneCroquis } from "@/croquis/eventos";
import { urlDeEvento } from "@/lib/rutas";

const CroquisVisor = lazy(() => import("@/components/CroquisVisor"));

/**
 * El mapa 3D con dirección propia: `/evento/<slug>/mapa`.
 *
 * Para marketing: el link se puede poner en un anuncio, una historia o un
 * WhatsApp y abre el mapa directo, con un botón para comprar. La página tiene
 * su vista previa horneada en el build (`vite/paginasEvento.ts`), así que al
 * compartirla se ve "Mapa 3D · <evento>" con el flyer.
 *
 * Desde la página del evento también se llega acá (con `desdeEvento` en el
 * estado): ahí cerrar es volver atrás, y el botón de atrás del celular cierra
 * el mapa, que es lo que se espera.
 */
const MapaEvento = () => {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { events } = useAuth();
  const evento = events.find((e) => e.slug === slug);
  const desdeEvento = Boolean((location.state as { desdeEvento?: boolean } | null)?.desdeEvento);

  useEffect(() => {
    const previo = document.title;
    document.title = evento ? `Mapa 3D · ${evento.name} · ODÍSEA` : "Mapa 3D · ODÍSEA";
    // Al salir del mapa, la pestaña no tiene que seguir diciendo "Mapa 3D".
    return () => {
      document.title = previo;
    };
  }, [evento]);

  if (!tieneCroquis(slug)) return <Navigate to={urlDeEvento(slug)} replace />;

  const cerrar = () => (desdeEvento ? navigate(-1) : navigate(urlDeEvento(slug)));
  const vende = evento?.status === "activo";

  return (
    <Suspense fallback={<div className="fixed inset-0 bg-[#060912]" />}>
      <CroquisVisor
        slug={slug}
        onClose={cerrar}
        // Quien llega desde la página del evento ya tiene la compra abajo.
        compra={desdeEvento ? undefined : { href: urlDeEvento(slug), texto: vende ? "Comprar entradas" : "Ver la fecha" }}
      />
    </Suspense>
  );
};

export default MapaEvento;
