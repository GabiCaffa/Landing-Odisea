import { X } from "lucide-react";
import type { ReactNode } from "react";
import ModalShell, { type Ancho } from "@/components/ModalShell";

/**
 * La cáscara de los modales del panel: encabezado fijo, cuerpo que scrollea y
 * pie fijo con los botones.
 *
 * **Envuelve a `ModalShell` en vez de copiarlo.** El panel no tiene el problema
 * del ancestro con `transform` que obligó a portar los modales públicos (§6.5),
 * pero todo lo demás que ModalShell ya resuelve —`100dvh` en iOS, trabar el
 * scroll del fondo, cerrar con Escape y con el velo— hace falta igual. Escribir
 * un segundo shell era garantizar que uno de los dos se quedara atrás.
 *
 * Lo que agrega es la estructura que los 9 modales del panel repetían a mano:
 *
 * - **El pie es fijo.** Los botones de guardar vivían al final del contenido que
 *   scrollea, así que en un formulario largo en celular había que bajar hasta el
 *   fondo para poder guardar. Mismo criterio que el total del modal de compra.
 * - **`env(safe-area-inset-bottom)`** para despegarse de la barra de gestos del
 *   iPhone.
 * - **El botón de cerrar mide 44px**, el mínimo táctil. Los que había medían 40
 *   o menos y con el pulgar se fallan.
 */

const ModalAdmin = ({
  titulo,
  subtitulo,
  onClose,
  ancho = "2xl",
  pie,
  children,
}: {
  titulo: string;
  /** Segunda línea chica: de qué evento/persona se trata. */
  subtitulo?: string;
  onClose: () => void;
  ancho?: Ancho;
  /** Botones del pie. Si no va ninguno, el pie no se dibuja. */
  pie?: ReactNode;
  children: ReactNode;
}) => (
  <ModalShell onClose={onClose} ancho={ancho} etiqueta={titulo}>
    <header className="flex items-start gap-3 border-b border-border px-4 py-3 sm:px-6 sm:py-4">
      <div className="min-w-0 flex-1">
        <h2 className="title-sport truncate text-lg font-black uppercase tracking-wide sm:text-xl">
          {titulo}
        </h2>
        {subtitulo && (
          <p className="truncate text-xs text-muted-foreground">{subtitulo}</p>
        )}
      </div>
      <button
        onClick={onClose}
        aria-label="Cerrar"
        className="-mr-2 flex h-11 w-11 flex-shrink-0 items-center justify-center transition-colors hover:bg-muted"
      >
        <X className="h-5 w-5" />
      </button>
    </header>

    {/* El que scrollea es el cuerpo, no el panel: por eso el encabezado y el
        pie quedan quietos. `overscroll-contain` evita que al llegar al final
        el dedo siga y arrastre la página de atrás. */}
    <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
      {children}
    </div>

    {pie && (
      <footer
        className="flex flex-col-reverse gap-2 border-t border-border bg-background px-4 py-3 sm:flex-row sm:justify-end sm:px-6"
        // En celular los botones se apilan y el principal queda ARRIBA
        // (flex-col-reverse), que es donde cae el pulgar.
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        {pie}
      </footer>
    )}
  </ModalShell>
);

export default ModalAdmin;
