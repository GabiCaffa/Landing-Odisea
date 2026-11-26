import type { Pieza, Predio, Punto, Valla } from "./tipos";

/**
 * Navidad en la Plaza de Toros (Colonia del Sacramento).
 *
 * El edificio sale de fotos y videos de la Plaza de Toros Real de San Carlos ya
 * remodelada: ruedo de pasto con su muro, gradas grises, galería con arcos,
 * fachada con almenas y la torre del arco de entrada al sur. **No está a escala**:
 * las medidas son aproximadas (ruedo de ~52 m) y el visor lo dice.
 *
 * El armado del evento es lo que contó el autor: la fiesta es **sólo en el ruedo**
 * (las gradas no se usan), con un **escenario grande en un borde** (acá, el norte,
 * enfrente del arco de entrada), el **VIP +30 arriba del escenario, atrás del DJ**,
 * y **barras en los tres lados donde no está el escenario**.
 *
 * Suposiciones (no las dijo nadie, se corrigen acá): el escenario al norte, la
 * barra del sur corrida a un costado del ingreso, la escalera del VIP sobre el
 * costado este del escenario, y el árbol de Navidad (ambientación). No hay baños
 * ni auxilios dibujados: están en el edificio y no se sabe dónde.
 *
 * Coordenadas en metros, con el centro del ruedo en (0, 0): x al este, z al sur.
 */

const R = 26; // radio del ruedo (hasta el muro)
const ADENTRO = 25.5; // donde termina el piso de la gente, contra el muro

/** Punto sobre un círculo: ángulo 0 = sur (+z), π/2 = este (+x), π = norte. */
const en = (r: number, a: number): Punto => [r * Math.sin(a), r * Math.cos(a)];
const arco = (r: number, desde: number, hasta: number, n: number): Punto[] =>
  Array.from({ length: n + 1 }, (_, i) => en(r, desde + ((hasta - desde) * i) / n));

// El escenario: x de -10 a 10, z de -23 (fondo) a -11 (frente). El VIP es la
// franja de atrás (z de -23 a -17), más alta. La escalera sube por el costado
// este (x de 10 a 12,4) desde z -10,5 (abajo) hasta z -19,5 (arriba).
const ESC = { x0: -10, x1: 10, fondo: -23, frente: -11 };
const VIP_FRENTE = -17;
const VIP_ALTURA = 2.6;
const ESCALERA = { x0: 10, x1: 12.4, abajo: -10.5, arriba: -19.5 };

/** El ruedo menos el escenario y la escalera: lo que es General. */
const general: Punto[] = (() => {
  const angulo = ([x, z]: Punto) => Math.atan2(x, z);
  const borde = (x: number): Punto => [x, -Math.sqrt(ADENTRO * ADENTRO - x * x)];
  const este = borde(ESCALERA.x1);
  const oeste = borde(ESC.x0);
  // Del borde del ruedo al este de la escalera (≈ +2,6 rad), dando la vuelta por
  // el sur (0), hasta el oeste del escenario (≈ -2,7 rad).
  const vuelta = arco(ADENTRO, angulo(este), angulo(oeste), 56);
  return [[ESC.x0, ESCALERA.abajo], [ESCALERA.x1, ESCALERA.abajo], ...vuelta];
})();

const vip: Punto[] = [
  [ESC.x0, ESC.fondo],
  [ESC.x1, ESC.fondo],
  [ESC.x1, VIP_FRENTE],
  [ESC.x0, VIP_FRENTE],
];

const piezas: Pieza[] = [
  { tipo: "plazaToros", x: 0, z: 0, radio: R },
  {
    tipo: "escenario",
    x: 0,
    z: (ESC.fondo + ESC.frente) / 2,
    largo: ESC.x1 - ESC.x0,
    fondo: ESC.frente - ESC.fondo,
    altura: 1.6,
    elevado: { fondo: VIP_FRENTE - ESC.fondo, altura: VIP_ALTURA },
    texto: "NAVIDAD\nODÍSEA",
  },
  {
    tipo: "escalera",
    x: (ESCALERA.x0 + ESCALERA.x1) / 2,
    z: (ESCALERA.abajo + ESCALERA.arriba) / 2,
    largo: ESCALERA.abajo - ESCALERA.arriba,
    fondo: ESCALERA.x1 - ESCALERA.x0,
    altura: VIP_ALTURA,
  },
  // Barras en los tres lados sin escenario, mirando al centro.
  { tipo: "barra", x: 22.8, z: 0, rot: -90, largo: 6 },
  { tipo: "barra", x: -22.8, z: 0, rot: 90, largo: 6 },
  { tipo: "barra", x: 8.5, z: 21.2, rot: -158, largo: 6 },
  // El ingreso al ruedo, por el túnel del arco principal.
  { tipo: "acceso", x: 0, z: 25.4, rot: 180, largo: 5, texto: "INGRESO" },
  // Ambientación.
  { tipo: "arbolNavidad", x: -15, z: 18 },
];

/** Lo que frena al caminar y no se ve como valla (lo que se ve es el muro, el escenario, la baranda). */
const vallas: Valla[] = [
  // El muro del ruedo, entero (el túnel del ingreso no lleva a ningún lado).
  { puntos: arco(25.8, 0, Math.PI * 2, 72), invisible: true },
  // El escenario no se pisa: oeste, frente y este hasta el VIP.
  { puntos: [[ESC.x0, -24.2], [ESC.x0, ESC.frente], [ESC.x1, ESC.frente], [ESC.x1, VIP_FRENTE]], invisible: true },
  // Baranda del VIP: de arriba no se baja al lugar del DJ.
  { puntos: [[ESC.x0, VIP_FRENTE], [ESC.x1, VIP_FRENTE]], invisible: true },
  // Costado de afuera de la escalera y su rellano, hasta el muro.
  { puntos: [[ESCALERA.x1, ESCALERA.abajo], [ESCALERA.x1, -21], [ESC.x1, -23.8]], invisible: true },
];

const plazaToros: Predio = {
  nombre: "Navidad en la Plaza de Toros",
  subtitulo: "Colonia del Sacramento · En el ruedo · General · VIP +30",
  // El orden importa: cada zona se dibuja arriba de las anteriores.
  zonas: [
    {
      id: "general",
      nombre: "General",
      poligono: general,
      color: "#2f6b34",
      etiqueta: [0, 6],
      // Más gente que esto y caminando no se pasa (la gente frena).
      gente: 14,
      entradas: { incluye: ["general"] },
    },
    {
      id: "vip",
      nombre: "VIP +30",
      poligono: vip,
      color: "#d22b3c",
      etiqueta: [-4, -20],
      gente: 14,
      altura: VIP_ALTURA,
      entradas: { incluye: ["vip", "+30"] },
      especial: true,
    },
  ],
  vallas,
  piezas,
  focos: [
    { x: -7, z: -6, color: "#ff2a4a" },
    { x: 7, z: -6, color: "#38e8ff" },
    { x: 0, z: 6, color: "#a855f7" },
  ],
  inicio: { x: 0, z: 22 },
  // Las gradas y la fachada ocupan hasta ~47 m; la explanada y la calle, hasta ~70.
  radioLibre: 74,
  vistas: [
    {
      id: "todo",
      nombre: "Toda la plaza",
      descripcion: "La Plaza de Toros Real de San Carlos. La fiesta es en el ruedo: el escenario al fondo y tres barras.",
      mira: [0, 0, -2],
      camara: [62, 74, 98],
    },
    {
      id: "llegada",
      nombre: "Llegada",
      descripcion: "Se entra por el arco principal y el túnel, y se llega al ruedo de frente al escenario.",
      mira: [0, 4, -14],
      camara: [0, 5, 26],
    },
    {
      id: "escenario",
      nombre: "Escenario",
      descripcion: "Escenario grande con pantalla sobre el borde norte del ruedo. El DJ va adelante, al centro.",
      mira: [0, 5, -17],
      camara: [4, 9, 9],
    },
    {
      id: "vip",
      nombre: "VIP +30",
      descripcion: "Arriba del escenario, atrás del DJ, con vista a todo el ruedo. Se sube por la escalera del costado.",
      mira: [0, 3, -20],
      camara: [-16, 13, -1],
      zona: "vip",
    },
    {
      id: "barras",
      nombre: "Barras",
      descripcion: "Tres barras: una a cada lado del ruedo y otra al fondo, junto al ingreso.",
      mira: [0, 0, 0],
      camara: [0, 52, 46],
      muestra: ["barra"],
    },
  ],
};

export default plazaToros;
