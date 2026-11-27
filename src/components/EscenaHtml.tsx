import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Share2, X } from "lucide-react";
import { toast } from "sonner";
import { SITIO, urlDeMapa } from "@/lib/rutas";

interface Props {
  slug: string;
  /** El HTML de la escena, en `public/mapas/` (ver `ESCENA_HTML_DE_EVENTO`). */
  src: string;
  nombre: string;
  onClose: () => void;
  compra?: { href: string; texto: string };
}

/**
 * Mapa 3D hecho como página aparte (HTML suelto con su propio Three.js), a
 * pantalla completa en un iframe. La escena trae su título, vistas y horas;
 * acá sólo sumamos cerrar, compartir y comprar, arriba a la derecha (la escena
 * deja ese rincón libre). Por portal, como `CroquisVisor`.
 */
const EscenaHtml = ({ slug, src, nombre, onClose, compra }: Props) => {
  const [cargada, setCargada] = useState(false);
  // Por ref, como en CroquisVisor: `onClose` cambia en cada render y el efecto
  // de abajo tiene que correr una sola vez (si no, guarda mal el overflow previo).
  const cerrarRef = useRef(onClose);
  cerrarRef.current = onClose;

  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && cerrarRef.current();
    addEventListener("keydown", tecla);
    return () => {
      document.body.style.overflow = previo;
      removeEventListener("keydown", tecla);
    };
  }, []);

  const compartir = async () => {
    const url = `${SITIO}${urlDeMapa(slug)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Mapa 3D · ${nombre}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Link del mapa copiado");
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") toast.error("No se pudo copiar el link");
    }
  };

  const boton =
    "flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition-colors hover:bg-black/70";

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-[#0f141c]" role="dialog" aria-modal="true" aria-label={`Mapa 3D de ${nombre}`}>
      {!cargada && (
        <p className="absolute inset-0 flex animate-pulse items-center justify-center text-sm tracking-wide text-white/70">
          Armando el lugar…
        </p>
      )}
      <iframe
        src={src}
        title={`Mapa 3D · ${nombre}`}
        onLoad={() => setCargada(true)}
        className="absolute inset-0 h-full w-full border-0"
        allow="fullscreen"
      />
      <div className="absolute right-4 top-[max(0.875rem,env(safe-area-inset-top))] flex flex-col items-end gap-2">
        <div className="flex gap-2">
          <button type="button" onClick={() => void compartir()} className={boton} aria-label="Compartir el mapa">
            <Share2 className="h-5 w-5" />
          </button>
          <button type="button" onClick={onClose} className={boton} aria-label="Cerrar el mapa">
            <X className="h-5 w-5" />
          </button>
        </div>
        {compra && (
          <Link
            to={compra.href}
            className="inline-flex h-10 items-center rounded-full bg-[#F25C26] px-4 text-xs font-bold uppercase tracking-wide text-white transition-opacity hover:opacity-90 sm:text-sm"
          >
            {compra.texto}
          </Link>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default EscenaHtml;
