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
  /**
   * Qué entradas del evento son de esta zona, por palabras en su nombre (sin
   * tildes ni mayúsculas): así "VIP – 2do lote" sigue siendo del VIP cuando
   * cambia el lote. Al caminar por la zona se ofrece comprarla.
   */
  entradas?: { incluye: string[]; excluye?: string[] };
  /**
   * Metros sobre el piso: una zona en alto (el VIP arriba del escenario). El piso
   * se dibuja a esa altura, la gente se para ahí y al caminar se sube. A una zona
   * elevada se llega por una `escalera`; lo que la rodea se cierra con vallas.
   */
  altura?: number;
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
  | "banderaGolf"
  | "torreLuz"
  | "palosRugby"
  | "contenedor"
  | "bandera"
  | "plazaToros"
  | "escenario"
  | "escalera"
  | "lona";

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
  /** Radio del ruedo (plaza de toros). */
  radio?: number;
  /** Profundidad (escenario) o ancho (escalera). */
  fondo?: number;
  /** Altura del piso del escenario, o hasta dónde sube la escalera. */
  altura?: number;
  /** Escenario: parte de atrás más alta (el VIP), con su profundidad y altura. */
  elevado?: { fondo: number; altura: number };
  /** Lona: la imagen (de `public/`, p. ej. un sponsor) y su alto en metros (el ancho es `largo`). */
  imagen?: string;
  alto?: number;
}

export interface Valla {
  puntos: Punto[];
  /** Guirnalda de lamparitas arriba. */
  luces?: boolean;
  /**
   * `reja` (por defecto): la valla de contención metálica, baja y que deja ver.
   * `media`: media sombra negra de 2 m, como el cerco del perímetro en las fotos.
   */
  estilo?: "reja" | "media";
  /**
   * Sólo frena, no se dibuja: cuando lo que se ve ya es otra cosa (el muro del
   * ruedo, el borde del escenario, la baranda del VIP).
   */
  invisible?: boolean;
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
  /**
   * Sin árboles a menos de esta distancia del centro: el predio ocupa más que sus
   * zonas (las gradas y la fachada de la plaza de toros, alrededor del ruedo).
   */
  radioLibre?: number;
  /**
   * Música de fondo del mapa: un set o playlist pública de SoundCloud. Suena al
   * tocar "Música" y, caminando, más fuerte cerca de `fuente` (el escenario).
   */
  musica?: { soundcloud: string; fuente: { x: number; z: number } };
}
