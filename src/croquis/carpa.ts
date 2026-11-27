import type { Predio, Punto, Valla } from "./tipos";
import { crearEscenaCarpa } from "./carpa/escena";

/**
 * Navidad Canelones: "Baile en la carpa".
 *
 * La escena NO es de piezas: es la que se hizo en conjunto con la organización
 * (baile-en-la-carpa.vercel.app), copiada en `carpa/escena.ts` y puesta como
 * `decorado`. Este archivo le agrega lo que necesita el motor para caminar:
 * zonas (dónde se está y qué entrada ofrecer), vallas invisibles, cajas que
 * frenan y las escaleras de las tarimas.
 *
 * Coordenadas de la escena (metros): el centro de la carpa en (0, 0), x al
 * este, z al sur. Perímetro de 100 x 50 (x de -30,7 a 69,3; z de -25,1 a 24,9),
 * con los accesos sobre el lado este. Backstage al oeste (tarima de 1,4 m),
 * pista General al este, tarima +21 al norte de la pista (1,42 m) y la franja
 * +21 entre la carpa y el perímetro norte, con su pórtico en x = 20,6.
 */

const PX0 = -30.7, PX1 = 69.3, PZ0 = -25.1, PZ1 = 24.9;
const ZG = 4.9; // acceso general
const ZVI = -10.75; // acceso +21
const ALTO_VIP = 1.42, ALTO_BK = 1.4;

const rect = (x0: number, z0: number, x1: number, z1: number): Punto[] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const linea = (...puntos: Punto[]): Valla => ({ puntos, invisible: true });

const carpa: Predio = {
  nombre: "Baile en la carpa",
  subtitulo: "Navidad Canelones · General, +21 y Backstage",
  decorado: crearEscenaCarpa,
  zonas: [
    // El orden importa: gana la última zona que contiene el punto.
    { id: "llegada", nombre: "Llegada", poligono: rect(PX1, -60, 175, 110), color: "#5b7f3a" },
    { id: "general", nombre: "General", poligono: rect(PX0, PZ0, PX1, PZ1), color: "#8f1420", entradas: { incluye: ["general"] } },
    {
      id: "mas21",
      nombre: "Sector +21",
      poligono: [[PX0, PZ0], [20.6, PZ0], [20.6, -12.5], [-20.2, -12.5], [-20.2, -11.3], [PX0, -11.3]],
      color: "#e0a92a",
      entradas: { incluye: ["+21"] },
    },
    { id: "tarima", nombre: "Tarima +21", poligono: rect(-6.15, -12.5, 13, -6.1), color: "#e0a92a", altura: ALTO_VIP, entradas: { incluye: ["+21"] } },
    { id: "backstage", nombre: "Backstage", poligono: rect(-20.3, -12.5, -6.2, 12.4), color: "#4b1830", altura: ALTO_BK, entradas: { incluye: ["backstage"] } },
  ],
  vallas: [
    // Perímetro, abierto en los dos accesos del lado este.
    linea([PX1, PZ0], [PX0, PZ0], [PX0, PZ1], [PX1, PZ1]),
    linea([PX1, PZ0], [PX1, ZVI - 3.25]),
    linea([PX1, ZVI + 3.25], [PX1, ZG - 4.75]),
    linea([PX1, ZG + 4.75], [PX1, PZ1]),
    // Vallas de la cola del acceso general, afuera.
    ...[ZG - 3.6, ZG - 1.2, ZG + 1.2, ZG + 3.6].map((z) => linea([71, z], [88.5, z])),
    // Sector +21: su costado oeste (con el paso a sus baños), el pórtico y el borde contra la pista.
    linea([-20.2, -24.4], [-20.2, -20.1]),
    linea([-20.2, -15.6], [-20.2, -11.3]),
    linea([20.6, PZ0], [20.6, -20.3]),
    linea([20.6, -15.6], [20.6, -12.5], [13, -12.5]),
    // Producción y generador, al oeste.
    linea([-20.4, 14.1], [-20.4, PZ1]),
    linea([-6.7, 12.9], [-6.7, PZ1]),
    linea([-21.8, -7], [-21.8, 7.3]),
    // Tarima +21: baranda contra la pista y bordes, abiertos en sus dos escaleras (x -3,5 y 10,65).
    linea([-6.15, -12.5], [-5.75, -12.5]),
    linea([-1.25, -12.5], [8.35, -12.5]),
    linea([12.95, -12.5], [13, -12.5], [13, -6.1], [-6.15, -6.1]),
    // Pared del DJ entre la pista y el Backstage.
    linea([-6.2, -12.5], [-6.2, 12.5]),
    // Backstage: telón, abierto en su escalera (x -14,3).
    linea([-6.2, 12.5], [-20.4, 12.5], [-20.4, -12.5], [-16.55, -12.5]),
    linea([-12.05, -12.5], [-6.2, -12.5]),
  ],
  solidos: [
    [-6.15, -2.55, -3.55, 5.45], // cabina del DJ
    [35.9, 50.9, -24.85, -20.8], // barras
    [12.7, 27.7, 20.7, 24.75],
    [-6.9, 3.1, -24.85, -20.8],
    [62.1, 68.4, -24.8, -19.3], // ropería
    [-29.8, -21, -24.6, -23.4], // baños +21
    [-29.8, -21, -14, -12.8],
    [-30.3, -29.1, -22.2, -15],
    [46.8, 68.2, 23.3, 24.5], // baños generales
    [67.7, 68.9, 15.4, 22.4],
    [46.2, 47.4, 15.4, 22.4],
    [-25.8, -23.2, -3, 3], // generador
    [-26.9, -24.3, 14.9, 21.6], // camión
    [42.4, 49.6, -8.1, -0.9], // árbol de Navidad
  ],
  // Las escaleras suben hacia el sur, desde la franja +21 hasta el borde de la tarima.
  rampas: [
    { x: -3.5, z: -14.1, rot: Math.PI, largo: 3, ancho: 4, altura: ALTO_VIP },
    { x: 10.65, z: -14.1, rot: Math.PI, largo: 3, ancho: 4, altura: ALTO_VIP },
    { x: -14.3, z: -14.1, rot: Math.PI, largo: 3, ancho: 4, altura: ALTO_BK },
  ],
  piezas: [],
  vistas: [
    { id: "general", nombre: "Todo el predio", descripcion: "El perímetro de 100 por 50 metros con la carpa adentro, los dos accesos, las barras y los baños.", camara: [112, 58, 78], mira: [22, 0, 0] },
    { id: "llegada", nombre: "Llegada", descripcion: "Se entra por la tranquera sobre la callecita. Las estacas azules marcan la senda de los que van a pie; las rojas, el acceso de los autos.", camara: [168, 40, 104], mira: [112, 0, 50] },
    { id: "ingresos", nombre: "Accesos", descripcion: "Los dos accesos están sobre el mismo lado: el general, con la cola entre vallas, y el del sector +21, con su camino amarillo.", camara: [98, 10, 20], mira: [70, 3, -3] },
    { id: "pista", nombre: "General", descripcion: "La pista de General mirando al DJ. Detrás, la gente del Backstage y la pantalla con la cuenta regresiva. A la derecha, la tarima +21.", camara: [18.5, 5.4, 5], mira: [-6.15, 3.6, 1], zona: "general" },
    { id: "dj", nombre: "DJ y pantalla", descripcion: "El DJ con el Backstage detrás. La pantalla del fondo calcula sola cuánto falta para Navidad.", camara: [7.5, 5.6, 5.5], mira: [-6.15, 4, 0.95] },
    { id: "tarima", nombre: "Tarima +21", descripcion: "Tarima elevada a lo largo del costado norte de General, con baranda dorada y sillones. Se sube por dos escaleras desde el sector +21.", camara: [15, 7, 5], mira: [2, 2, -9.3], zona: "tarima" },
    { id: "backstage", nombre: "Backstage", descripcion: "Desde adentro del Backstage: la gente detrás del DJ, la cabina de espaldas y toda la pista enfrente.", camara: [-19.2, 4.7, 7], mira: [-6, 2.3, 0], zona: "backstage" },
    { id: "mas21", nombre: "Sector +21", descripcion: "La franja norte, entre el pórtico y los baños del sector: su barra de 10 metros y las escaleras que suben a la tarima y al Backstage.", camara: [16, 16, -44], mira: [0, 0.5, -17], zona: "mas21" },
    { id: "barras", nombre: "Barras", descripcion: "Dos barras generales de 15 metros, una contra el fondo norte y otra contra el sur, y la ropería en la esquina, al lado de los accesos.", camara: [46, 11, 2], mira: [45, 1.2, -21] },
    { id: "banos", nombre: "Baños", descripcion: "Los baños generales, en la esquina sureste, pegados al acceso general.", camara: [50, 10, -2], mira: [57, 1, 20] },
    { id: "noel", nombre: "Papá Noel", descripcion: "Un Papá Noel gigante saluda al lado de la senda de entrada; por el predio hay un trineo con renos, muñecos de nieve y regalos.", camara: [130, 13, 38], mira: [109, 5.5, 19] },
  ],
  // Recién pasado el acceso general, mirando a la carpa (al oeste).
  inicio: { x: 64, z: ZG, giro: -90 },
  musica: { soundcloud: "https://soundcloud.com/bavikon/reggaeton-mix-2026-reggaeton", fuente: { x: -4.4, z: 0.95 } },
};

export default carpa;
