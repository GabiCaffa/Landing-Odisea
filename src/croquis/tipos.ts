/**
 * Cómo se describe un predio para el croquis 3D.
 *
 * Un predio es DATOS: zonas (pisos), vallas, piezas (barras, baños, DJ…) y las
 * vistas del recorrido. El motor (`motor.ts`) sabe dibujar cada cosa; un predio
 * nuevo es un archivo de datos más, no código nuevo.
 *
 * Coordenadas en METROS sobre el piso: `x` crece hacia la derecha (este) y `z`
 * hacia el frente (sur, donde suelen estar los ingresos). El origen es el que
 * elija cada predio.
 */

export type Punto = [number, number];

export type Hora = "dia" | "atardecer" | "noche";

export interface ZonaPredio {
  id: string;
  nombre: string;
  poligono: Punto[];
  /** Color del piso y de la etiqueta. */
  color: string;
  /** Dónde va el cartel con el nombre. Sin esto no lleva cartel. */
  etiqueta?: Punto;
  /** Gente por cada 100 m². 0 o ausente = vacía. */
  gente?: number;
}

export type TipoPieza =
  | "barra"
  | "banos"
  | "auxilios"
  | "dj"
  | "pantalla"
  | "control"
  | "acceso"
  | "arbolNavidad"
  | "banderaGolf";

export interface Pieza {
  tipo: TipoPieza;
  x: number;
  z: number;
  /** Grados. 0 = el frente mira al sur (+z); 90 = mira al este (+x). */
  rot?: number;
  /** Largo o ancho, según la pieza (barra, control, acceso). */
  largo?: number;
  /** Cantidad (cabinas de baño). */
  cantidad?: number;
  /** Texto del cartel (acceso, pantalla). */
  texto?: string;
}

export interface Valla {
  puntos: Punto[];
  /** Guirnalda de lamparitas arriba. */
  luces?: boolean;
}

export interface Vista {
  id: string;
  nombre: string;
  descripcion: string;
  /** Adónde mira la cámara (x, y, z). */
  mira: [number, number, number];
  /** Dónde se para la cámara (x, y, z). */
  camara: [number, number, number];
  /** Zona que se resalta. */
  zona?: string;
  /** Piezas que muestran su cartel en esta vista (en las otras, no: ensucian). */
  muestra?: TipoPieza[];
}

export interface Predio {
  nombre: string;
  subtitulo: string;
  zonas: ZonaPredio[];
  vallas: Valla[];
  piezas: Pieza[];
  vistas: Vista[];
  /** Focos de colores para la noche (escenario, pista). */
  focos?: { x: number; z: number; color: string }[];
  /** Dónde aparece el personaje al empezar a caminar (mirando al norte). */
  inicio?: { x: number; z: number };
}
