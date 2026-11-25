import type { Pieza, Predio, Punto, Vista } from "./tipos";

/**
 * Navidad en el Golf (Paysandú).
 *
 * Sale del mapa que publicó la organización ("MAPA NAVIDAD EN EL GOLF"): las
 * posiciones están tomadas en píxeles de esa imagen y pasadas a metros con
 * `p()`. **No está a escala**: el mapa es un esquema, así que las medidas son
 * aproximadas y el visor lo dice.
 *
 * Lo que es suposición y no sale del mapa: los íconos redondos con una cara en
 * los bordes se tomaron como **baños**; la gente, los árboles alrededor, el
 * árbol de Navidad y la bandera de golf son ambientación.
 */

/** Píxel del mapa → metros. 0,25 m por píxel deja el predio en ~100 × 120 m. */
const p = (px: number, py: number): Punto => [(px - 250) * 0.25, (py - 470) * 0.25];
const rect = (x1: number, y1: number, x2: number, y2: number): Punto[] => [p(x1, y1), p(x2, y1), p(x2, y2), p(x1, y2)];
const en = (px: number, py: number) => {
  const [x, z] = p(px, py);
  return { x, z };
};
const vista = (
  id: string,
  nombre: string,
  descripcion: string,
  mira: [number, number],
  desplazo: [number, number, number],
  extra: Partial<Vista> = {}
): Vista => {
  const [x, z] = p(...mira);
  return { id, nombre, descripcion, mira: [x, 0, z], camara: [x + desplazo[0], desplazo[1], z + desplazo[2]], ...extra };
};

const piezas: Pieza[] = [
  // Barras (seis en el mapa).
  { tipo: "barra", ...en(83, 252), rot: 0 },
  { tipo: "barra", ...en(198, 252), rot: 0 },
  { tipo: "barra", ...en(68, 305), rot: 90 },
  { tipo: "barra", ...en(112, 403), rot: 180 },
  { tipo: "barra", ...en(92, 470), rot: 180, largo: 5 },
  { tipo: "barra", ...en(378, 360), rot: 90 },
  // DJ y pantalla, al fondo, mirando hacia la entrada.
  { tipo: "pantalla", ...en(140, 262), texto: "NAVIDAD\nEN EL GOLF" },
  { tipo: "dj", ...en(140, 282) },
  // Baños (los íconos de los bordes) y primeros auxilios (las cruces).
  { tipo: "banos", ...en(44, 262), rot: 90, cantidad: 4 },
  { tipo: "banos", ...en(44, 400), rot: 90, cantidad: 4 },
  { tipo: "banos", ...en(74, 432), rot: 90, cantidad: 2 },
  { tipo: "banos", ...en(236, 262), rot: -90, cantidad: 4 },
  { tipo: "banos", ...en(240, 350), rot: -90, cantidad: 3 },
  { tipo: "auxilios", ...en(77, 511) },
  { tipo: "auxilios", ...en(300, 432) },
  // Llegada: dos líneas de control y los tres ingresos.
  { tipo: "control", ...en(188, 618), largo: 40 },
  { tipo: "control", ...en(188, 657), largo: 40 },
  { tipo: "acceso", ...en(135, 716), largo: 13, texto: "INGRESO +15" },
  { tipo: "acceso", ...en(197, 716), largo: 14, texto: "GENERAL" },
  { tipo: "acceso", ...en(250, 716), largo: 10, texto: "VIP Y BACKSTAGE" },
  { tipo: "acceso", ...en(242, 486), largo: 9, texto: "VIP Y BACKSTAGE" },
  // Ambientación.
  { tipo: "arbolNavidad", ...en(196, 432) },
  { tipo: "arbolNavidad", ...en(305, 690) },
  { tipo: "banderaGolf", ...en(360, 610) },
];

const golf: Predio = {
  nombre: "Navidad en el Golf",
  subtitulo: "Paysandú · General +18 · VIP +20 · Backstage +23 · Sector +15",
  // El orden importa: cada zona se dibuja arriba de las anteriores.
  zonas: [
    { id: "general", nombre: "General +18", poligono: rect(60, 236, 225, 480), color: "#8a1f2c", etiqueta: p(100, 345), gente: 12 },
    { id: "backstage", nombre: "Backstage +23", poligono: rect(92, 238, 192, 288), color: "#4b1830", etiqueta: p(110, 262), gente: 5 },
    { id: "vip", nombre: "VIP +20", poligono: rect(145, 290, 222, 382), color: "#d22b3c", etiqueta: p(184, 330), gente: 9 },
    { id: "sector15", nombre: "Sector +15", poligono: rect(63, 410, 152, 478), color: "#b4471f", etiqueta: p(118, 440), gente: 12 },
    { id: "pasillo", nombre: "Pasillo", poligono: rect(225, 314, 368, 332), color: "#55555c", gente: 2 },
    { id: "rampa", nombre: "Rampa", poligono: [p(225, 442), p(380, 405), p(445, 405), p(272, 490)], color: "#55555c", gente: 2 },
    { id: "pista", nombre: "Pista electrónica", poligono: rect(368, 314, 445, 405), color: "#3b1f6e", etiqueta: p(406, 340), gente: 14 },
    { id: "carril15", nombre: "Ingreso +15", poligono: rect(100, 478, 155, 598), color: "#46464d", gente: 2 },
    { id: "carrilGeneral", nombre: "Ingreso General", poligono: rect(155, 480, 222, 598), color: "#4d4d54", gente: 2 },
    { id: "carrilVip", nombre: "Ingreso VIP", poligono: rect(222, 486, 268, 598), color: "#46464d", gente: 1 },
    { id: "controles", nombre: "Controles", poligono: rect(105, 598, 268, 722), color: "#3c3c42", gente: 3 },
  ],
  vallas: [
    // El sector principal, con guirnalda.
    { puntos: [p(225, 314), p(225, 236), p(60, 236), p(60, 480), p(100, 480)], luces: true },
    { puntos: [p(225, 332), p(225, 442)], luces: true },
    // VIP (con su ingreso abajo), backstage y sector +15.
    { puntos: [p(145, 290), p(145, 382), p(170, 382)] },
    { puntos: [p(195, 382), p(222, 382)] },
    { puntos: [p(92, 238), p(92, 288), p(122, 288)] },
    { puntos: [p(158, 288), p(192, 288), p(192, 238)] },
    { puntos: [p(63, 410), p(152, 410), p(152, 478)] },
    // Pasillo y rampa a la pista electrónica.
    { puntos: [p(225, 314), p(368, 314)], luces: true },
    { puntos: [p(225, 332), p(368, 332)] },
    { puntos: [p(225, 442), p(380, 405)] },
    { puntos: [p(272, 490), p(445, 405)], luces: true },
    { puntos: [p(368, 332), p(368, 405)] },
    { puntos: [p(368, 314), p(445, 314), p(445, 405)], luces: true },
    // Carriles de ingreso.
    { puntos: [p(100, 480), p(100, 598)] },
    { puntos: [p(155, 478), p(155, 598)] },
    { puntos: [p(222, 486), p(222, 598)] },
    { puntos: [p(268, 490), p(268, 598)] },
    { puntos: [p(105, 598), p(105, 722)] },
    { puntos: [p(268, 598), p(268, 722)] },
  ],
  piezas,
  focos: [
    { ...en(140, 300), color: "#ff2a4a" },
    { ...en(406, 360), color: "#a855f7" },
    { ...en(406, 330), color: "#38e8ff" },
    { ...en(188, 640), color: "#ffb347" },
  ],
  vistas: [
    vista(
      "todo",
      "Todo el predio",
      "La entrada con los controles abajo, el sector principal con General, VIP, Backstage y +15, y a la derecha la pista electrónica.",
      [250, 480],
      [50, 115, 125]
    ),
    vista(
      "llegada",
      "Llegada",
      "Tres ingresos, uno por entrada: +15, General y VIP y Backstage. Después de los dos controles, cada fila sigue por su pasillo.",
      [188, 650],
      [30, 46, 72],
      { zona: "controles" }
    ),
    vista(
      "general",
      "General +18",
      "La zona más grande. El DJ y la pantalla al fondo, y barras arriba, sobre el costado y frente al sector +15.",
      [110, 360],
      [26, 34, 52],
      { zona: "general", muestra: ["barra"] }
    ),
    vista(
      "vip",
      "VIP +20",
      "Justo frente al DJ. Tiene su ingreso propio desde la entrada de VIP y Backstage.",
      [184, 336],
      [18, 24, 36],
      { zona: "vip" }
    ),
    vista(
      "backstage",
      "Backstage +23",
      "Atrás del DJ y a sus costados, con una barra de cada lado.",
      [142, 262],
      [14, 22, 34],
      { zona: "backstage", muestra: ["barra"] }
    ),
    vista(
      "sector15",
      "Sector +15",
      "Tiene su propio pasillo desde el ingreso +15 y su barra.",
      [108, 444],
      [-18, 26, 38],
      { zona: "sector15", muestra: ["barra"] }
    ),
    vista(
      "pista",
      "Pista electrónica",
      "A la derecha del predio, con su barra. Se llega por el pasillo de arriba o por la rampa.",
      [400, 365],
      [-6, 32, 46],
      { zona: "pista", muestra: ["barra"] }
    ),
    vista(
      "barras",
      "Barras",
      "Seis barras: dos arriba a los costados del backstage, una sobre el lateral de General, una frente al +15, una adentro del +15 y una en la pista.",
      [200, 370],
      [30, 85, 105],
      { muestra: ["barra"] }
    ),
    vista(
      "banos",
      "Baños y auxilios",
      "Los baños están sobre los bordes del predio. Hay dos puestos de primeros auxilios: junto al ingreso +15 y entre el predio y la pista.",
      [190, 400],
      [30, 85, 105],
      { muestra: ["banos", "auxilios"] }
    ),
  ],
};

export default golf;
