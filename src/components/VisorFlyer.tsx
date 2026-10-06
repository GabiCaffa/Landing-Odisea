import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface Props {
  src: string;
  alt: string;
  onClose: () => void;
}

/**
 * El flyer a tamaño grande, sin salir de la página.
 *
 * Antes tocar el flyer abría la imagen en otra pestaña del navegador, que saca
 * a la persona de la compra. Esto la muestra encima de la misma página y se
 * cierra tocando la imagen, el fondo, el ✕ o con Escape.
 *
 * Va por `createPortal` a `document.body` por la misma razón que `ModalShell`
 * (§6.5): un ancestro con `transform` —y esta página anima la entrada— rompe el
 * `position: fixed` de sus hijos. No usa `ModalShell` porque ése es una hoja con
 * fondo y borde pensada para formularios, y acá la imagen tiene que flotar sola
 * sobre el velo.
 */
const VisorFlyer = ({ src, alt, onClose }: Props) => {
  // En un ref para que cambiar el handler no re-arme los listeners.
  const cerrarRef = useRef(onClose);
  cerrarRef.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrarRef.current();
    };
    document.addEventListener("keydown", onKey);

    // Se guarda lo que había y se lo devuelve, en vez de asumir "auto".
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previo;
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-velo/85 p-4 backdrop-blur-sm"
      onClick={() => cerrarRef.current()}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
    >
      <img
        src={src}
        alt={alt}
        // `dvh` y no `vh`: en Safari de iOS `100vh` cuenta la barra de
        // direcciones y la imagen quedaría tapada abajo.
        className="max-h-[88dvh] max-w-full cursor-zoom-out rounded-2xl object-contain shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
      />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          cerrarRef.current();
        }}
        aria-label="Cerrar"
        className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-background/90 text-foreground shadow-md transition-colors hover:bg-background"
      >
        <X className="h-5 w-5" />
      </button>
    </div>,
    document.body
  );
};

export default VisorFlyer;
