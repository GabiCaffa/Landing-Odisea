import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * La caja de todos los modales del sitio público: velo, panel, scroll y cierre.
 *
 * **Existe por un bug que se veía como un problema de diseño.** Los tres modales
 * repetían `fixed inset-0 z-50` a mano, y el de compra se abría *dentro del
 * carrusel*: el velo oscurecía sólo esa franja y el panel quedaba a 935 px de la
 * parte de arriba de la pantalla — o sea, fuera de la vista en un celular.
 *
 * La causa no está en el modal sino arriba: las secciones aparecen al hacer
 * scroll con `opacity-0 translate-y-12`, y **un ancestro con `transform` deja de
 * ser el viewport para el `position: fixed` de sus hijos**. `inset-0` se resolvía
 * contra la tarjeta del evento. Es una regla del CSS, no un detalle de Tailwind,
 * y afecta también a `filter`, `perspective`, `backdrop-filter`, `contain` y
 * `will-change` — o sea que cualquier animación futura lo vuelve a romper.
 *
 * La única solución estable es **sacar el modal del árbol**: va por un portal a
 * `document.body`, donde no hay ningún ancestro transformado. Por eso esto es un
 * componente compartido y no un arreglo repetido tres veces.
 *
 * De paso resuelve lo que cada modal tenía a medias o no tenía:
 *
 * - **Hoja completa en celular, diálogo centrado de `sm:` para arriba.** El 99%
 *   del tráfico entra desde el teléfono; ahí un diálogo flotante con márgenes
 *   desperdicia pantalla y deja el contenido apretado.
 * - **`100dvh` y no `vh`.** En Safari de iOS `100vh` cuenta la barra de
 *   direcciones que está tapando la pantalla, así que el borde de abajo —donde
 *   vive el botón de enviar— queda debajo de la barra.
 * - **Se traba el scroll del fondo.** Sin esto, al llegar al final del modal el
 *   dedo sigue y lo que se mueve es la página de atrás.
 * - **Cierra con Escape y tocando el velo**, que es lo que la gente intenta.
 */

interface Props {
  onClose: () => void;
  children: ReactNode;
  /** Ancho máximo del panel en escritorio. */
  ancho?: "md" | "2xl";
  /** Para lectores de pantalla: qué es este diálogo. */
  etiqueta: string;
}

const ANCHOS = { md: "sm:max-w-md", "2xl": "sm:max-w-2xl" } as const;

const ModalShell = ({ onClose, children, ancho = "2xl", etiqueta }: Props) => {
  // En un ref para que cambiar el handler no re-arme los listeners.
  const cerrarRef = useRef(onClose);
  cerrarRef.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrarRef.current();
    };
    document.addEventListener("keydown", onKey);

    // Se traba el scroll del fondo. Se guarda lo que había en vez de asumir
    // "auto": si algún día hay dos modales encadenados, el de adentro no tiene
    // por qué devolverle el scroll a la página al cerrarse.
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previo;
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-velo/70 backdrop-blur-sm sm:items-center sm:p-4"
      // Sólo el velo cierra: un click que EMPIEZA adentro y termina afuera
      // (seleccionar texto y soltar de más) no tiene que cerrar el modal.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cerrarRef.current();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={etiqueta}
    >
      <div
        /*
         * `h-[100dvh]` = el alto REAL del celular, ya descontada la barra de
         * direcciones; con `100vh` el borde de abajo —donde vive el botón de
         * enviar— queda tapado por la barra en Safari de iOS. En un navegador
         * sin `dvh` la declaración se descarta, queda `height: auto` y el
         * `items-stretch` del padre lo estira igual: se degrada solo.
         *
         * `flex-col` + `overflow-hidden` es lo que permite el encabezado fijo:
         * el hijo que scrollea es el cuerpo, no el panel entero.
         */
        className={`relative flex h-[100dvh] w-full flex-col overflow-hidden bg-background sm:h-auto sm:max-h-[92vh] sm:border sm:border-border ${ANCHOS[ancho]}`}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};

export default ModalShell;
