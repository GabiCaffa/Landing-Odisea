import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Hora, Pieza, Predio, Punto, TipoPieza, Vista, ZonaPredio } from "./tipos";
import { crearManoConVaso } from "./personaje";

/**
 * El motor del croquis 3D: arma la escena de un `Predio` (datos) con piezas
 * hechas con geometría simple —cajas, conos, esferas—, sin modelos ni
 * archivos que bajar. Es el mismo enfoque del croquis de referencia: lo que
 * pesa es Three.js (~150 KB gzip), y se baja recién al abrir el mapa.
 *
 * Decisiones que explican el código:
 * - **Una sola pasada de dibujo, sin postproceso** (bloom, etc.). Se ve casi
 *   igual con materiales emisivos y en un celular de gama media es la
 *   diferencia entre andar fluido y trabarse.
 * - **La gente es UNA malla instanciada** (cuerpo + cabeza): cientos de
 *   personas cuestan dos llamadas de dibujo.
 * - **Se dibuja un cuadro apenas se arma**, sin esperar al bucle de animación:
 *   con la pestaña en segundo plano `requestAnimationFrame` no corre, y el
 *   mapa tiene que verse igual al volver.
 * - **Los carteles de barras y baños sólo se ven en su vista.** Con todos
 *   prendidos a la vez la vista general es una sopa de letras.
 */

export interface ControlCroquis {
  verVista(id: string, inmediato?: boolean): void;
  ponerHora(hora: Hora): void;
  /** Modo caminata en primera persona. */
  caminar(activo: boolean): void;
  /** Frena la caminata (con el modal de compra abierto): no lee teclas ni mira. */
  pausar(activo: boolean): void;
  /** Joystick: x a la derecha, y hacia adelante, de -1 a 1. */
  mover(x: number, y: number): void;
  correr(activo: boolean): void;
  liberar(): void;
}

interface Opciones {
  movil: boolean;
  reducirMovimiento: boolean;
  /** Avisa la zona en la que se está parado al caminar (null = afuera). */
  onZona?: (zona: { id: string; nombre: string } | null) => void;
}

/** ¿Se cruzan los segmentos ab y cd? */
function cruzan(a: Punto, b: Punto, c: Punto, d: Punto): boolean {
  const lado = (p: Punto, q: Punto, r: Punto) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = lado(c, d, a);
  const d2 = lado(c, d, b);
  const d3 = lado(a, b, c);
  const d4 = lado(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

// ─── Utilidades ─────────────────────────────────────────────────────────────

/** Azar con semilla: el predio se ve igual en cada carga. */
function azar(semilla: number) {
  let a = semilla;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dentro([x, z]: Punto, poligono: Punto[]): boolean {
  let adentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [xi, zi] = poligono[i];
    const [xj, zj] = poligono[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) adentro = !adentro;
  }
  return adentro;
}

function area(poligono: Punto[]): number {
  let s = 0;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    s += (poligono[j][0] + poligono[i][0]) * (poligono[j][1] - poligono[i][1]);
  }
  return Math.abs(s / 2);
}

function caja(ancho: number, alto: number, fondo: number, material: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(ancho, alto, fondo), material);
  m.position.set(x, y, z);
  return m;
}

/** Rectángulo redondeado a mano: `ctx.roundRect` no está en todos los navegadores. */
function rectRedondeado(ctx: CanvasRenderingContext2D, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(w - r, 0);
  ctx.quadraticCurveTo(w, 0, w, r);
  ctx.lineTo(w, h - r);
  ctx.quadraticCurveTo(w, h, w - r, h);
  ctx.lineTo(r, h);
  ctx.quadraticCurveTo(0, h, 0, h - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
}

function texturaTexto(texto: string, o: { fondo?: string; color?: string; alto?: number; redondo?: boolean } = {}) {
  const alto = o.alto ?? 96;
  const pad = alto * 0.42;
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  const fuente = `800 ${Math.round(alto * 0.58)}px "Inter Tight", system-ui, sans-serif`;
  ctx.font = fuente;
  const w = Math.ceil(ctx.measureText(texto).width + pad * 2);
  c.width = w;
  c.height = alto;
  ctx.font = fuente;
  if (o.fondo) {
    ctx.fillStyle = o.fondo;
    if (o.redondo === false) ctx.fillRect(0, 0, w, alto);
    else {
      rectRedondeado(ctx, w, alto, alto / 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = o.color ?? "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(texto, w / 2, alto / 2 + alto * 0.03);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, aspecto: w / alto };
}

function cartel(texto: string, altoMundo: number, fondo: string, color = "#ffffff") {
  const { tex, aspecto } = texturaTexto(texto, { fondo, color });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(altoMundo * aspecto, altoMundo, 1);
  s.renderOrder = 10;
  return s;
}

const ROJO = "#c8202f";

// ─── El motor ───────────────────────────────────────────────────────────────

export function crearCroquis(canvas: HTMLCanvasElement, predio: Predio, op: Opciones): ControlCroquis {
  // Tira si el navegador no tiene WebGL: el visor lo atrapa y lo dice.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !op.movil, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, op.movil ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = !op.movil;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const escena = new THREE.Scene();
  escena.fog = new THREE.Fog(0x000000, 160, 520);
  const camara = new THREE.PerspectiveCamera(42, 1, 0.5, 1500);

  const controles = new OrbitControls(camara, canvas);
  controles.enableDamping = true;
  controles.dampingFactor = 0.08;
  controles.maxPolarAngle = 1.38;
  controles.minDistance = 10;
  controles.maxDistance = 280;
  controles.screenSpacePanning = false;

  const sorteo = azar(20261224);

  // Límites del predio: para no dejar que la cámara se vaya y para los árboles.
  const todos = predio.zonas.flatMap((z) => z.poligono);
  const minX = Math.min(...todos.map((p) => p[0]));
  const maxX = Math.max(...todos.map((p) => p[0]));
  const minZ = Math.min(...todos.map((p) => p[1]));
  const maxZ = Math.max(...todos.map((p) => p[1]));

  // Materiales que brillan de noche: se escalan con la hora.
  const emisivos: { mat: THREE.MeshStandardMaterial; base: number }[] = [];
  const brilla = (color: string, base = 1.6, extra: THREE.MeshStandardMaterialParameters = {}) => {
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: base, ...extra });
    emisivos.push({ mat, base });
    return mat;
  };
  const mate = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...extra });

  // ── Luz ──
  const cielo = new THREE.HemisphereLight(0xffffff, 0x334422, 1);
  escena.add(cielo);
  const sol = new THREE.DirectionalLight(0xffffff, 2);
  sol.castShadow = !op.movil;
  sol.shadow.mapSize.set(2048, 2048);
  const cam = sol.shadow.camera as THREE.OrthographicCamera;
  cam.left = -110;
  cam.right = 110;
  cam.top = 110;
  cam.bottom = -110;
  cam.far = 500;
  escena.add(sol, sol.target);

  const focos = (predio.focos ?? []).map((f) => {
    const luz = new THREE.PointLight(f.color, 0, 70, 1.6);
    luz.position.set(f.x, 9, f.z);
    escena.add(luz);
    return luz;
  });

  // ── Piso ──
  const pasto = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), mate("#4f7d3c"));
  pasto.rotation.x = -Math.PI / 2;
  pasto.receiveShadow = true;
  escena.add(pasto);

  const zonasMat: Record<string, THREE.MeshStandardMaterial> = {};
  predio.zonas.forEach((z, i) => {
    const forma = new THREE.Shape(z.poligono.map(([x, zz]) => new THREE.Vector2(x, -zz)));
    const mat = new THREE.MeshStandardMaterial({
      color: z.color,
      roughness: 0.9,
      emissive: z.color,
      emissiveIntensity: 0.05,
    });
    zonasMat[z.id] = mat;
    const piso = new THREE.Mesh(new THREE.ShapeGeometry(forma), mat);
    piso.rotation.x = -Math.PI / 2;
    piso.position.y = 0.03 + i * 0.012;
    piso.receiveShadow = true;
    escena.add(piso);
    if (z.etiqueta) {
      const s = cartel(z.nombre.toUpperCase(), 3.2, z.color);
      s.position.set(z.etiqueta[0], 6.5, z.etiqueta[1]);
      escena.add(s);
    }
  });

  // ── Vallas y guirnaldas ──
  const metal = mate("#9aa0a8", { metalness: 0.4, roughness: 0.5 });
  const posicionesLuz: THREE.Vector3[] = [];
  for (const v of predio.vallas) {
    for (let i = 0; i < v.puntos.length - 1; i++) {
      const [x1, z1] = v.puntos[i];
      const [x2, z2] = v.puntos[i + 1];
      const largo = Math.hypot(x2 - x1, z2 - z1);
      const tramo = caja(largo, 1.15, 0.12, metal, (x1 + x2) / 2, 0.58, (z1 + z2) / 2);
      tramo.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
      tramo.castShadow = true;
      escena.add(tramo);
      if (v.luces) {
        const n = Math.max(1, Math.floor(largo / 1.4));
        for (let k = 0; k <= n; k++) {
          const t = k / n;
          // Cuelgan un poco entre los postes: una guirnalda no es una regla.
          const caida = Math.sin(((k % 4) / 4) * Math.PI) * 0.18;
          posicionesLuz.push(new THREE.Vector3(x1 + (x2 - x1) * t, 1.5 - caida, z1 + (z2 - z1) * t));
        }
      }
    }
  }
  const lamparitas = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.11, 6, 4),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    Math.max(1, posicionesLuz.length)
  );
  const coloresLuz = ["#ff3b3b", "#ffd24a", "#3bdc6a", "#ffffff", "#ff8a1f"].map((c) => new THREE.Color(c));
  const m4 = new THREE.Matrix4();
  posicionesLuz.forEach((p, i) => {
    lamparitas.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z));
    lamparitas.setColorAt(i, coloresLuz[i % coloresLuz.length]);
  });
  lamparitas.count = posicionesLuz.length;
  escena.add(lamparitas);

  // ── Piezas ──
  // x, z: dónde está la pieza en el predio (se completa al ubicarla).
  const cartelesPieza: { tipo: TipoPieza; sprite: THREE.Sprite; x: number; z: number }[] = [];
  const rayos: THREE.Object3D[] = [];
  const conCartel = (tipo: TipoPieza, texto: string, fondo: string, g: THREE.Group, alto: number) => {
    const s = cartel(texto, 1.9, fondo);
    s.position.set(0, alto, 0);
    s.visible = false;
    g.add(s);
    cartelesPieza.push({ tipo, sprite: s, x: 0, z: 0 });
  };

  const constructores: Record<TipoPieza, (p: Pieza) => THREE.Group> = {
    barra: (p) => {
      const g = new THREE.Group();
      const largo = p.largo ?? 6;
      g.add(caja(largo, 1.1, 0.9, mate("#3a2a22"), 0, 0.55, 0));
      g.add(caja(largo + 0.15, 0.07, 1.05, mate("#e8e2d8"), 0, 1.14, 0));
      g.add(caja(largo, 0.08, 0.06, brilla("#ffb347", 1.2), 0, 0.9, 0.48));
      g.add(caja(largo, 2.3, 0.45, mate("#26262b"), 0, 1.15, -1.7));
      const { tex, aspecto } = texturaTexto("BARRA", { fondo: ROJO, redondo: false });
      const letrero = new THREE.Mesh(
        new THREE.PlaneGeometry(1.1 * aspecto, 1.1),
        brilla("#ffffff", 0.9, { map: tex, emissiveMap: tex })
      );
      letrero.position.set(0, 3.0, -1.45);
      g.add(letrero);
      conCartel("barra", "BARRA", ROJO, g, 4.6);
      return g;
    },
    banos: (p) => {
      const g = new THREE.Group();
      const n = p.cantidad ?? 4;
      const azul = mate("#2f6fb5");
      const techo = mate("#f2f2f2");
      const puerta = mate("#1f4f86");
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * 1.5;
        g.add(caja(1.3, 2.3, 1.3, azul, x, 1.15, 0));
        g.add(caja(1.42, 0.12, 1.42, techo, x, 2.36, 0));
        g.add(caja(0.8, 1.9, 0.04, puerta, x, 1.05, 0.67));
      }
      conCartel("banos", "BAÑOS", "#2f6fb5", g, 4);
      return g;
    },
    auxilios: () => {
      const g = new THREE.Group();
      g.add(caja(3.4, 2.6, 3.4, mate("#f4f4f4"), 0, 1.3, 0));
      const cruz = brilla("#ff2a2a", 1.4);
      g.add(caja(1.6, 0.45, 0.05, cruz, 0, 1.5, 1.72));
      g.add(caja(0.45, 1.6, 0.05, cruz, 0, 1.5, 1.72));
      g.add(caja(1.6, 0.05, 0.45, cruz, 0, 2.63, 0));
      g.add(caja(0.45, 0.05, 1.6, cruz, 0, 2.63, 0));
      conCartel("auxilios", "PRIMEROS AUXILIOS", "#d61f2c", g, 4.4);
      return g;
    },
    dj: () => {
      const g = new THREE.Group();
      g.add(caja(10, 0.9, 6, mate("#1b1b1f"), 0, 0.45, 0));
      g.add(caja(3.4, 1.1, 1.1, mate("#0f0f12"), 0, 1.45, 0.9));
      g.add(caja(3.4, 0.12, 0.05, brilla("#ff2a4a", 2), 0, 1.6, 1.48));
      const truss = mate("#3b3b42", { metalness: 0.6, roughness: 0.4 });
      for (const sx of [-4.8, 4.8])
        for (const sz of [-2.8, 2.8]) g.add(caja(0.28, 7, 0.28, truss, sx, 4.4, sz));
      g.add(caja(9.9, 0.3, 0.3, truss, 0, 7.8, 2.8));
      g.add(caja(9.9, 0.3, 0.3, truss, 0, 7.8, -2.8));
      const colores = ["#ff2a4a", "#ffd24a", "#38e8ff", "#ff2a4a", "#a855f7"];
      colores.forEach((c, i) => g.add(caja(0.5, 0.4, 0.5, brilla(c, 2.2), -4 + i * 2, 7.45, 2.8)));
      // Haces de luz: se ven de noche y al atardecer, y se mueven.
      colores.slice(0, 4).forEach((c, i) => {
        const pivote = new THREE.Group();
        pivote.position.set(-3 + i * 2, 7.4, 2.8);
        const haz = new THREE.Mesh(
          new THREE.ConeGeometry(2.4, 18, 16, 1, true),
          new THREE.MeshBasicMaterial({
            color: c,
            transparent: true,
            opacity: 0.13,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        );
        haz.position.y = -9;
        pivote.add(haz);
        pivote.userData.fase = i * 1.3;
        g.add(pivote);
        rayos.push(pivote);
      });
      const s = cartel("DJ", 2.2, "#111114");
      s.position.set(0, 10, 0);
      g.add(s);
      return g;
    },
    pantalla: (p) => {
      const g = new THREE.Group();
      g.add(caja(12.4, 7, 0.5, mate("#151518"), 0, 5, 0));
      for (const x of [-4, 4]) g.add(caja(0.4, 1.6, 0.4, mate("#151518"), x, 0.8, 0));
      const c = document.createElement("canvas");
      c.width = 1024;
      c.height = 512;
      const ctx = c.getContext("2d")!;
      const grad = ctx.createLinearGradient(0, 0, 1024, 512);
      grad.addColorStop(0, "#7a0d1a");
      grad.addColorStop(0.5, "#d4202f");
      grad.addColorStop(1, "#3a0610");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1024, 512);
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = '900 110px "Inter Tight", system-ui, sans-serif';
      const lineas = (p.texto ?? "ODÍSEA").split("\n");
      lineas.forEach((l, i) => ctx.fillText(l, 512, 256 + (i - (lineas.length - 1) / 2) * 125));
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const pantalla = new THREE.Mesh(new THREE.PlaneGeometry(11.8, 5.9), brilla("#ffffff", 1, { map: tex, emissiveMap: tex }));
      pantalla.position.set(0, 5, 0.27);
      g.add(pantalla);
      return g;
    },
    control: (p) => {
      const g = new THREE.Group();
      const largo = p.largo ?? 30;
      const rojo = mate(ROJO);
      const postes = Math.max(2, Math.round(largo / 8) + 1);
      for (let i = 0; i < postes; i++) {
        const x = -largo / 2 + (largo * i) / (postes - 1);
        g.add(caja(0.22, 3.4, 0.22, metal, x, 1.7, -1.3));
        g.add(caja(0.22, 3.4, 0.22, metal, x, 1.7, 1.3));
      }
      g.add(caja(largo + 0.6, 0.18, 3.2, rojo, 0, 3.45, 0));
      const { tex, aspecto } = texturaTexto("CONTROL", { fondo: ROJO, redondo: false });
      const letrero = new THREE.Mesh(new THREE.PlaneGeometry(1.4 * aspecto, 1.4), brilla("#ffffff", 0.9, { map: tex, emissiveMap: tex }));
      letrero.position.set(0, 4.3, 1.62);
      g.add(letrero);
      const molinete = mate("#d8d8dc", { metalness: 0.5, roughness: 0.4 });
      for (let x = -largo / 2 + 1; x < largo / 2; x += 1.8) {
        g.add(caja(0.32, 1, 0.5, molinete, x, 0.5, 0));
        g.add(caja(0.05, 0.05, 0.9, molinete, x + 0.45, 0.85, 0));
      }
      return g;
    },
    acceso: (p) => {
      const g = new THREE.Group();
      const ancho = p.largo ?? 8;
      const rojo = mate(ROJO);
      g.add(caja(0.8, 5, 0.8, rojo, -ancho / 2, 2.5, 0));
      g.add(caja(0.8, 5, 0.8, rojo, ancho / 2, 2.5, 0));
      g.add(caja(ancho + 0.8, 1.5, 0.7, rojo, 0, 5.4, 0));
      const { tex, aspecto } = texturaTexto(p.texto ?? "INGRESO", { fondo: ROJO, redondo: false });
      const alto = 1.1;
      const ancho2 = Math.min(ancho + 0.4, alto * aspecto);
      const letrero = new THREE.Mesh(
        new THREE.PlaneGeometry(ancho2, ancho2 / aspecto),
        brilla("#ffffff", 0.9, { map: tex, emissiveMap: tex })
      );
      letrero.position.set(0, 5.4, 0.37);
      g.add(letrero);
      return g;
    },
    arbolNavidad: () => {
      const g = new THREE.Group();
      g.add(caja(0.6, 1.2, 0.6, mate("#5a3a22"), 0, 0.6, 0));
      const verde = mate("#1d6b38");
      [
        [4.2, 4.5, 3.2],
        [3.3, 3.8, 5.8],
        [2.3, 3.2, 8.1],
      ].forEach(([r, h, y]) => {
        const cono = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), verde);
        cono.position.y = y;
        cono.castShadow = true;
        g.add(cono);
      });
      const estrella = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), brilla("#ffd24a", 3));
      estrella.position.y = 10.2;
      g.add(estrella);
      const bolas = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 6, 4), new THREE.MeshBasicMaterial(), 40);
      const r = azar(7);
      for (let i = 0; i < 40; i++) {
        const y = 1.8 + r() * 7.4;
        const radio = Math.max(0.6, 4.4 * (1 - (y - 1.2) / 9.5));
        const a = r() * Math.PI * 2;
        bolas.setMatrixAt(i, m4.makeTranslation(Math.cos(a) * radio, y, Math.sin(a) * radio));
        bolas.setColorAt(i, coloresLuz[i % coloresLuz.length]);
      }
      g.add(bolas);
      return g;
    },
    banderaGolf: () => {
      const g = new THREE.Group();
      const green = new THREE.Mesh(new THREE.CircleGeometry(5, 24), mate("#6fae4f"));
      green.rotation.x = -Math.PI / 2;
      green.position.y = 0.02;
      g.add(green);
      g.add(caja(0.08, 3.4, 0.08, mate("#ffffff"), 0, 1.7, 0));
      const tela = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1.4, -0.45), new THREE.Vector2(0, -0.9)]);
      const bandera = new THREE.Mesh(new THREE.ShapeGeometry(tela), mate(ROJO, { side: THREE.DoubleSide }));
      bandera.position.set(0.04, 3.4, 0);
      g.add(bandera);
      return g;
    },
  };

  const gruposPieza: { tipo: TipoPieza; g: THREE.Group }[] = [];
  for (const p of predio.piezas) {
    const previos = cartelesPieza.length;
    const g = constructores[p.tipo](p);
    for (const c of cartelesPieza.slice(previos)) {
      c.x = p.x;
      c.z = p.z;
    }
    g.position.set(p.x, 0, p.z);
    g.rotation.y = ((p.rot ?? 0) * Math.PI) / 180;
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !(o as THREE.InstancedMesh).isInstancedMesh) o.castShadow = true;
    });
    escena.add(g);
    gruposPieza.push({ tipo: p.tipo, g });
  }

  // ── Árboles alrededor (es un club de golf) ──
  const nArboles = op.movil ? 60 : 110;
  const troncos = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 2.4, 6), mate("#5a3a22"), nArboles);
  const copas = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.4, 0), mate("#2f5d2a"), nArboles);
  const tonosCopa = ["#2f5d2a", "#3a6b30", "#284f24", "#41742f"].map((c) => new THREE.Color(c));
  const q = new THREE.Quaternion();
  const esc = new THREE.Vector3();
  const pos = new THREE.Vector3();
  let puestos = 0;
  for (let intento = 0; puestos < nArboles && intento < nArboles * 30; intento++) {
    const x = minX - 90 + sorteo() * (maxX - minX + 180);
    const z = minZ - 90 + sorteo() * (maxZ - minZ + 180);
    if (x > minX - 14 && x < maxX + 14 && z > minZ - 14 && z < maxZ + 14) continue;
    const s = 0.8 + sorteo() * 0.9;
    esc.set(s, s, s);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), sorteo() * Math.PI);
    troncos.setMatrixAt(puestos, m4.compose(pos.set(x, 1.2 * s, z), q, esc));
    copas.setMatrixAt(puestos, m4.compose(pos.set(x, (2.4 + 2) * s, z), q, esc.set(s, s * 1.15, s)));
    copas.setColorAt(puestos, tonosCopa[puestos % tonosCopa.length]);
    puestos++;
  }
  troncos.count = puestos;
  copas.count = puestos;
  copas.castShadow = true;
  escena.add(troncos, copas);

  // ── Gente ──
  // Cada persona son piezas de malla instanciada: piernas (con zapatillas),
  // remera con brazos, piel (cabeza, cuello y manos) y pelo. Hay dos posturas
  // —brazos abajo y brazos arriba bailando—, cada una con su remera y su piel.
  // Seis llamadas de dibujo para cientos de personas. Al caminar en primera
  // persona se las ve de cerca: por eso dejaron de ser un cilindro con una bola.
  interface Persona {
    x: number;
    z: number;
    fase: number;
    ritmo: number;
    giro: number;
    baila: boolean;
    escala: number;
    arriba: boolean;
    idx: number;
  }
  const gente: Persona[] = [];
  const tope = op.movil ? 300 : 800;
  const pedidas = predio.zonas.reduce((s, z) => s + (area(z.poligono) * (z.gente ?? 0)) / 100, 0);
  const factor = pedidas > tope ? tope / pedidas : 1;
  const djs = predio.piezas.filter((pz) => pz.tipo === "dj");
  predio.zonas.forEach((z, i) => {
    const n = Math.round(((area(z.poligono) * (z.gente ?? 0)) / 100) * factor);
    if (!n) return;
    const xs = z.poligono.map((pt) => pt[0]);
    const zs = z.poligono.map((pt) => pt[1]);
    const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    const baila = (z.gente ?? 0) >= 6;
    const pista = /pista/i.test(z.id);
    // Hacia dónde mira la gente que baila: el centro de la pista, o el DJ.
    let foco: { x: number; z: number } | null = null;
    if (baila && pista) foco = { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
    else if (baila && djs.length) {
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      foco = djs.reduce((a, b) => (Math.hypot(b.x - cx, b.z - cz) < Math.hypot(a.x - cx, a.z - cz) ? b : a));
    }
    let hechas = 0;
    for (let k = 0; hechas < n && k < n * 40; k++) {
      const pt: Punto = [x0 + sorteo() * (x1 - x0), z0 + sorteo() * (z1 - z0)];
      if (!dentro(pt, z.poligono)) continue;
      // La persona es de la ÚLTIMA zona que la contiene: así el VIP, que está
      // dibujado arriba de General, no recibe gente de los dos lados.
      let duena = -1;
      predio.zonas.forEach((otra, j) => {
        if (dentro(pt, otra.poligono)) duena = j;
      });
      if (duena !== i) continue;
      const giro = foco
        ? Math.atan2(foco.x - pt[0], foco.z - pt[1]) + (sorteo() - 0.5) * 0.9
        : sorteo() * Math.PI * 2;
      gente.push({
        x: pt[0],
        z: pt[1],
        fase: sorteo() * Math.PI * 2,
        ritmo: 5 + sorteo() * 3,
        giro,
        baila,
        escala: 0.92 + sorteo() * 0.16,
        arriba: baila && sorteo() < (pista ? 0.45 : 0.18),
        idx: 0,
      });
      hechas++;
    }
  });

  // Las piezas, armadas una vez. `parte` gira la pieza sobre su centro y la ubica.
  const parte = (g: THREE.BufferGeometry, x: number, y: number, z: number, rz = 0) => {
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    return g;
  };
  const unir = (gs: THREE.BufferGeometry[]) => mergeGeometries(gs) ?? gs[0];
  const torso = () => parte(new THREE.BoxGeometry(0.46, 0.6, 0.26), 0, 1.13, 0);
  const brazo = (x: number, y: number, rz: number) => parte(new THREE.BoxGeometry(0.12, 0.56, 0.14), x, y, 0, rz);
  const cabeza = () => [
    parte(new THREE.SphereGeometry(0.14, 12, 9), 0, 1.6, 0),
    parte(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8), 0, 1.46, 0),
  ];
  const manito = (x: number, y: number) => parte(new THREE.SphereGeometry(0.055, 7, 5), x, y, 0);
  const geoPiernas = unir([
    parte(new THREE.BoxGeometry(0.17, 0.8, 0.2), 0.1, 0.44, 0),
    parte(new THREE.BoxGeometry(0.17, 0.8, 0.2), -0.1, 0.44, 0),
    parte(new THREE.BoxGeometry(0.19, 0.09, 0.3), 0.1, 0.045, 0.04),
    parte(new THREE.BoxGeometry(0.19, 0.09, 0.3), -0.1, 0.045, 0.04),
  ]);
  const geoRemeraAbajo = unir([torso(), brazo(0.3, 1.12, 0.1), brazo(-0.3, 1.12, -0.1)]);
  const geoRemeraArriba = unir([torso(), brazo(0.27, 1.66, -0.3), brazo(-0.27, 1.66, 0.3)]);
  const geoPielAbajo = unir([...cabeza(), manito(0.33, 0.83), manito(-0.33, 0.83)]);
  const geoPielArriba = unir([...cabeza(), manito(0.355, 1.94), manito(-0.355, 1.94)]);
  const geoPelo = parte(new THREE.SphereGeometry(0.152, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0, 1.62, -0.012);

  const abajo = gente.filter((pp) => !pp.arriba);
  const arriba = gente.filter((pp) => pp.arriba);
  abajo.forEach((pp, i) => (pp.idx = i));
  arriba.forEach((pp, i) => (pp.idx = i));
  const instanciar = (geo: THREE.BufferGeometry, n: number) => {
    const m = new THREE.InstancedMesh(geo, mate("#ffffff"), Math.max(1, n));
    m.count = n;
    escena.add(m);
    return m;
  };
  const mPiernas = instanciar(geoPiernas, gente.length);
  const mPelo = instanciar(geoPelo, gente.length);
  const mRemeraAbajo = instanciar(geoRemeraAbajo, abajo.length);
  const mRemeraArriba = instanciar(geoRemeraArriba, arriba.length);
  const mPielAbajo = instanciar(geoPielAbajo, abajo.length);
  const mPielArriba = instanciar(geoPielArriba, arriba.length);

  const paleta = (cs: string[]) => cs.map((c) => new THREE.Color(c));
  const remeras = paleta(["#1d1d22", "#f2f2f2", "#c8202f", "#2a4d8f", "#e0a526", "#2f7a46", "#6b2a8f", "#e46aa0", "#1e8a8a", "#111114", "#d9d2c3"]);
  const pantalones = paleta(["#2b3f63", "#1a1a1e", "#3a4f7a", "#c9b79c", "#55555c", "#1f2a44"]);
  const pieles = paleta(["#f1c9a5", "#e2ad82", "#c98d62", "#a8714a", "#7a4b2e"]);
  const pelos = paleta(["#141010", "#2a1a12", "#4a2c18", "#8a5a2b", "#d8b26a", "#7a2c1a"]);
  gente.forEach((pp, i) => {
    const r = () => Math.floor(sorteo() * 1e6);
    mPiernas.setColorAt(i, pantalones[r() % pantalones.length]);
    mPelo.setColorAt(i, pelos[r() % pelos.length]);
    const remera = remeras[r() % remeras.length];
    const tono = pieles[r() % pieles.length];
    if (pp.arriba) {
      mRemeraArriba.setColorAt(pp.idx, remera);
      mPielArriba.setColorAt(pp.idx, tono);
    } else {
      mRemeraAbajo.setColorAt(pp.idx, remera);
      mPielAbajo.setColorAt(pp.idx, tono);
    }
  });

  const ejeY = new THREE.Vector3(0, 1, 0);
  const ubicarGente = (t: number) => {
    const quietos = op.reducirMovimiento;
    gente.forEach((pp, i) => {
      const fase = t * pp.ritmo + pp.fase;
      const salto = pp.baila && !quietos ? Math.abs(Math.sin(fase)) * 0.1 : 0;
      const giro = pp.giro + (pp.baila && !quietos ? Math.sin(fase * 0.5) * 0.18 : 0);
      q.setFromAxisAngle(ejeY, giro);
      m4.compose(pos.set(pp.x, salto, pp.z), q, esc.setScalar(pp.escala));
      mPiernas.setMatrixAt(i, m4);
      mPelo.setMatrixAt(i, m4);
      if (pp.arriba) {
        mRemeraArriba.setMatrixAt(pp.idx, m4);
        mPielArriba.setMatrixAt(pp.idx, m4);
      } else {
        mRemeraAbajo.setMatrixAt(pp.idx, m4);
        mPielAbajo.setMatrixAt(pp.idx, m4);
      }
    });
    for (const m of [mPiernas, mPelo, mRemeraAbajo, mRemeraArriba, mPielAbajo, mPielArriba]) m.instanceMatrix.needsUpdate = true;
  };

  // Estado de la cámara (lo usan las vistas y la caminata).
  let vistaActual: Vista | undefined;
  const desde = { pos: new THREE.Vector3(), mira: new THREE.Vector3() };
  const hacia = { pos: new THREE.Vector3(), mira: new THREE.Vector3() };
  let viaje = 1; // 0..1; 1 = quieto
  const DURACION = 1.4;
  let t = 0;

  // ── Caminata en primera persona ──
  // Los ojos a 1,65 m. Lo único que se ve de uno es la mano con el vaso de
  // ODÍSEA, colgada de la cámara. Se mira arrastrando (mouse o dedo) y se camina
  // con WASD / flechas / joystick, siempre relativo a hacia dónde se mira.
  const OJOS = 1.65;
  const mano = crearManoConVaso();
  // La mano va en una escena APARTE que se dibuja después, encima de todo
  // (`dibujar`): pegado a una pared o a la pantalla del DJ, la pared tapaba la
  // mano, que está a medio metro de los ojos. Es lo que hacen los juegos.
  // `soporte` copia la posición de la cámara en cada cuadro.
  const escenaMano = new THREE.Scene();
  const soporte = new THREE.Group();
  soporte.matrixAutoUpdate = false;
  soporte.add(mano.grupo);
  escenaMano.add(soporte);
  // Luz propia, pareja a cualquier hora: la manga negra y el vaso se perdían de noche.
  escenaMano.add(new THREE.HemisphereLight("#ffffff", "#3a3a44", 1.6));
  const luzMano = new THREE.DirectionalLight("#ffe2c4", 1.6);
  luzMano.position.set(0.6, 1.2, 0.8);
  escenaMano.add(luzMano);

  // Lo que frena: las vallas (no se cruzan), las barras, baños, auxilios, el DJ
  // y la pantalla (no se atraviesan) y la gente (se la esquiva). Los controles
  // y los arcos de ingreso se atraviesan: son por donde se entra.
  const tramos: [Punto, Punto][] = predio.vallas.flatMap((v) =>
    v.puntos.slice(1).map((pt, i) => [v.puntos[i], pt] as [Punto, Punto])
  );
  const SOLIDOS = new Set<TipoPieza>(["barra", "banos", "auxilios", "dj", "pantalla", "arbolNavidad"]);
  const obstaculos: [number, number, number, number][] = [];
  for (const { tipo, g } of gruposPieza) {
    if (!SOLIDOS.has(tipo)) continue;
    g.updateMatrixWorld(true);
    const caja3 = new THREE.Box3();
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (o as THREE.InstancedMesh).isInstancedMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      if (mats.some((x) => x.transparent)) return; // los haces de luz
      caja3.expandByObject(m);
    });
    if (!caja3.isEmpty()) obstaculos.push([caja3.min.x - 0.3, caja3.max.x + 0.3, caja3.min.z - 0.3, caja3.max.z + 0.3]);
  }
  const RADIO_PERSONA = 0.5;
  const ocupado = (x: number, z: number) =>
    obstaculos.some(([a, b, c, d]) => x > a && x < b && z > c && z < d) ||
    gente.some((pp) => (pp.x - x) ** 2 + (pp.z - z) ** 2 < RADIO_PERSONA * RADIO_PERSONA);
  const choca = (x0: number, z0: number, x1: number, z1: number) => {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const largo = Math.hypot(dx, dz) || 1;
    // Medio metro de margen, para no meter la nariz en la valla.
    const fin: Punto = [x1 + (dx / largo) * 0.45, z1 + (dz / largo) * 0.45];
    if (tramos.some(([c, d]) => cruzan([x0, z0], fin, c, d))) return true;
    // Si ya se estaba adentro de algo (nunca debería), se deja salir.
    return ocupado(x1, z1) && !ocupado(x0, z0);
  };

  let caminando = false;
  let corriendo = false;
  let pausado = false;
  const palanca = { x: 0, y: 0 };
  const teclas = new Set<string>();
  const inicio = predio.inicio ?? { x: (minX + maxX) / 2, z: maxZ + 6 };
  const yo = new THREE.Vector3(inicio.x, 0, inicio.z);
  let yaw = Math.PI; // mirando al norte (-z)
  let pitch = -0.06;
  let zonaActual: string | null | undefined;

  const zonaDe = (x: number, z: number): ZonaPredio | null => {
    let encontrada: ZonaPredio | null = null;
    for (const zona of predio.zonas) if (dentro([x, z], zona.poligono)) encontrada = zona;
    return encontrada;
  };

  const TECLAS_JUEGO = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"]);
  const alApretar = (e: KeyboardEvent) => {
    if (!caminando || pausado || !TECLAS_JUEGO.has(e.code)) return;
    const destino = e.target as HTMLElement | null;
    if (destino && /input|textarea|select/i.test(destino.tagName)) return;
    e.preventDefault();
    teclas.add(e.code);
  };
  const alSoltar = (e: KeyboardEvent) => teclas.delete(e.code);
  const alPerderFoco = () => teclas.clear();
  window.addEventListener("keydown", alApretar);
  window.addEventListener("keyup", alSoltar);
  window.addEventListener("blur", alPerderFoco);

  // Mirar arrastrando sobre el mapa (mouse o dedo). El joystick y los botones
  // son HTML encima del canvas: sus toques no llegan acá.
  let arrastre: { id: number; x: number; y: number } | null = null;
  const alBajar = (e: PointerEvent) => {
    if (!caminando || pausado) return;
    arrastre = { id: e.pointerId, x: e.clientX, y: e.clientY };
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* sin captura igual funciona mientras el dedo siga sobre el mapa */
    }
  };
  const alMover = (e: PointerEvent) => {
    if (!arrastre || e.pointerId !== arrastre.id) return;
    const k = e.pointerType === "touch" ? 0.0065 : 0.0045;
    yaw -= (e.clientX - arrastre.x) * k;
    pitch = THREE.MathUtils.clamp(pitch - (e.clientY - arrastre.y) * k, -1.1, 0.9);
    arrastre.x = e.clientX;
    arrastre.y = e.clientY;
  };
  const alSubir = (e: PointerEvent) => {
    if (arrastre && e.pointerId === arrastre.id) arrastre = null;
  };
  canvas.addEventListener("pointerdown", alBajar);
  canvas.addEventListener("pointermove", alMover);
  canvas.addEventListener("pointerup", alSubir);
  canvas.addEventListener("pointercancel", alSubir);

  const mirar = new THREE.Vector3();
  const caminar = (dt: number) => {
    let ix = pausado ? 0 : palanca.x;
    let iy = pausado ? 0 : palanca.y;
    if (teclas.has("KeyW") || teclas.has("ArrowUp")) iy += 1;
    if (teclas.has("KeyS") || teclas.has("ArrowDown")) iy -= 1;
    if (teclas.has("KeyD")) ix += 1;
    if (teclas.has("KeyA")) ix -= 1;
    // Las flechas de los costados giran, como en cualquier juego.
    if (teclas.has("ArrowLeft")) yaw += 2.2 * dt;
    if (teclas.has("ArrowRight")) yaw -= 2.2 * dt;
    const fuerza = Math.min(1, Math.hypot(ix, iy));
    const rapido = corriendo || teclas.has("ShiftLeft") || teclas.has("ShiftRight");
    let paso = 0;

    if (fuerza > 0.08) {
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      // Derecha de "adelante" (fx, fz) es (-fz, fx).
      let dx = fx * iy - fz * ix;
      let dz = fz * iy + fx * ix;
      const n = Math.hypot(dx, dz) || 1;
      const velocidad = (rapido ? 7 : 3.6) * fuerza;
      dx = (dx / n) * velocidad * dt;
      dz = (dz / n) * velocidad * dt;
      const x0 = yo.x;
      const z0 = yo.z;
      // Si algo tapa el paso, se esquiva: se prueba el mismo paso girado a un
      // lado y al otro, cada vez más, como quien se abre camino entre la gente.
      // Contra una valla eso mismo es deslizarse por ella.
      let [nx, nz] = [x0, z0];
      for (const ang of [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35]) {
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        const px = x0 + (dx * c - dz * s) * Math.max(c, 0.35);
        const pz = z0 + (dx * s + dz * c) * Math.max(c, 0.35);
        if (!choca(x0, z0, px, pz)) {
          [nx, nz] = [px, pz];
          break;
        }
      }
      yo.x = THREE.MathUtils.clamp(nx, minX - 30, maxX + 30);
      yo.z = THREE.MathUtils.clamp(nz, minZ - 30, maxZ + 30);
      const andado = Math.hypot(yo.x - x0, yo.z - z0);
      paso = dt > 0 ? andado / dt / 3.6 : 0;
    }

    const quietos = op.reducirMovimiento;
    const bamboleo = !quietos && paso > 0.05 ? Math.sin(t * (9 + paso * 3)) * 0.035 * Math.min(paso, 1.5) : 0;
    camara.position.set(yo.x, OJOS + bamboleo, yo.z);
    mirar.set(
      yo.x + Math.sin(yaw) * Math.cos(pitch),
      OJOS + bamboleo + Math.sin(pitch),
      yo.z + Math.cos(yaw) * Math.cos(pitch)
    );
    camara.lookAt(mirar);
    mano.animar(t, quietos ? 0 : paso);

    // Se ven sólo los carteles de lo que está cerca: con todos prendidos
    // (atraviesan todo) se amontonaban.
    for (const c of cartelesPieza) {
      const ddx = c.x - yo.x;
      const ddz = c.z - yo.z;
      c.sprite.visible = ddx * ddx + ddz * ddz < 22 * 22;
    }

    const zona = zonaDe(yo.x, yo.z);
    const id = zona?.id ?? null;
    if (id !== zonaActual) {
      zonaActual = id;
      op.onZona?.(zona ? { id: zona.id, nombre: zona.nombre } : null);
    }
  };

  const ponerCaminata = (activo: boolean) => {
    if (activo === caminando) return;
    caminando = activo;
    pausado = false;
    teclas.clear();
    palanca.x = palanca.y = 0;
    arrastre = null;
    viaje = 1;
    controles.enabled = !activo;
    // La mano está a medio metro de los ojos: con el plano cercano de 0,5 m se cortaba.
    camara.near = activo ? 0.05 : 0.5;
    ajustar();
    if (activo) {
      zonaActual = undefined;
      caminar(0);
    } else {
      // La vuelta a las vistas arranca desde donde se estaba mirando.
      controles.target.set(yo.x + Math.sin(yaw) * 6, 1, yo.z + Math.cos(yaw) * 6);
      verVista(vistaActual?.id ?? predio.vistas[0]?.id ?? "");
    }
  };

  // ── Hora del día ──
  let horaActual: Hora = "noche";
  const ponerHora = (hora: Hora) => {
    horaActual = hora;
    const H = {
      dia: { fondo: "#9cc9ef", cielo: ["#d6ecff", "#4a6b3a", 1.1], sol: ["#ffffff", 2.4, [70, 120, 50]], brillo: 0.12, focos: 0, lamp: "#8a8a8a" },
      atardecer: { fondo: "#e08a5c", cielo: ["#ffcfa0", "#3b2f25", 0.75], sol: ["#ffb070", 1.6, [-110, 35, 40]], brillo: 0.6, focos: 250, lamp: "#d8d8d8" },
      noche: { fondo: "#060912", cielo: ["#3a4a7a", "#0b0f0a", 0.32], sol: ["#9fb4ff", 0.45, [-60, 100, -40]], brillo: 1, focos: 700, lamp: "#ffffff" },
    }[hora];
    const fondo = new THREE.Color(H.fondo);
    escena.background = fondo;
    (escena.fog as THREE.Fog).color.copy(fondo);
    cielo.color.set(H.cielo[0] as string);
    cielo.groundColor.set(H.cielo[1] as string);
    cielo.intensity = H.cielo[2] as number;
    sol.color.set(H.sol[0] as string);
    sol.intensity = H.sol[1] as number;
    const [sx, sy, sz] = H.sol[2] as number[];
    sol.position.set(sx, sy, sz);
    for (const e of emisivos) e.mat.emissiveIntensity = e.base * H.brillo;
    for (const z of Object.values(zonasMat)) z.emissiveIntensity = hora === "noche" ? 0.12 : 0.04;
    focos.forEach((f) => (f.intensity = H.focos));
    (lamparitas.material as THREE.MeshBasicMaterial).color.set(H.lamp);
    for (const r of rayos) r.visible = hora !== "dia";
  };

  // ── Cámara y vistas ──

  const verVista = (id: string, inmediato = false) => {
    const v = predio.vistas.find((x) => x.id === id) ?? predio.vistas[0];
    if (!v) return;
    vistaActual = v;
    hacia.pos.set(...v.camara);
    hacia.mira.set(...v.mira);
    // Las vistas se piensan para una pantalla apaisada. En un celular parado el
    // predio no entra a lo ancho: la cámara se aleja sobre la misma línea.
    if (camara.aspect < 0.8) hacia.pos.sub(hacia.mira).multiplyScalar(1.7).add(hacia.mira);
    for (const c of cartelesPieza) c.sprite.visible = caminando || !!v.muestra?.includes(c.tipo);
    if (inmediato || op.reducirMovimiento) {
      camara.position.copy(hacia.pos);
      controles.target.copy(hacia.mira);
      viaje = 1;
    } else {
      desde.pos.copy(camara.position);
      desde.mira.copy(controles.target);
      viaje = 0;
    }
  };
  // Si la persona arrastra, el viaje se corta: manda ella.
  controles.addEventListener("start", () => {
    viaje = 1;
  });

  const suave = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  const actualizar = (dt: number) => {
    t += dt;
    if (viaje < 1) {
      viaje = Math.min(1, viaje + dt / DURACION);
      const k = suave(viaje);
      camara.position.lerpVectors(desde.pos, hacia.pos, k);
      controles.target.lerpVectors(desde.mira, hacia.mira, k);
    }
    if (caminando) caminar(dt);
    else {
      // Que el centro de la vista no se vaya del predio arrastrando.
      controles.target.x = THREE.MathUtils.clamp(controles.target.x, minX - 20, maxX + 20);
      controles.target.z = THREE.MathUtils.clamp(controles.target.z, minZ - 20, maxZ + 20);
      controles.target.y = THREE.MathUtils.clamp(controles.target.y, 0, 10);
      controles.update();
    }

    ubicarGente(t);
    if (!op.reducirMovimiento) {
      for (const r of rayos) {
        const f = r.userData.fase as number;
        r.rotation.z = Math.sin(t * 0.7 + f) * 0.55;
        r.rotation.x = 0.35 + Math.sin(t * 0.5 + f * 2) * 0.3;
      }
    }
    if (vistaActual?.zona && !caminando) {
      const mat = zonasMat[vistaActual.zona];
      const base = horaActual === "noche" ? 0.12 : 0.04;
      for (const m of Object.values(zonasMat)) if (m !== mat) m.emissiveIntensity = base;
      if (mat) mat.emissiveIntensity = base + 0.22 + Math.sin(t * 3) * 0.12;
    } else {
      const base = horaActual === "noche" ? 0.12 : 0.04;
      for (const m of Object.values(zonasMat)) m.emissiveIntensity = base;
    }
  };

  /** Un cuadro: el predio y, caminando, la mano con el vaso encima de todo. */
  function dibujar() {
    renderer.render(escena, camara);
    if (!caminando) return;
    soporte.matrix.copy(camara.matrixWorld);
    soporte.matrixWorldNeedsUpdate = true;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(escenaMano, camara);
    renderer.autoClear = true;
  }

  // ── Tamaño ──
  const ajustar = () => {
    const padre = canvas.parentElement;
    const w = padre?.clientWidth || canvas.clientWidth || 800;
    const h = padre?.clientHeight || canvas.clientHeight || 600;
    renderer.setSize(w, h, false);
    camara.aspect = w / h;
    // En un celular parado el predio no entra a lo ancho: se abre el lente.
    // Caminando, el lente se abre como en un juego (si no, todo se ve encima).
    camara.fov = caminando ? (w / h < 0.8 ? 78 : 66) : w / h < 0.8 ? 55 : 42;
    // La mano va abajo a la derecha de lo que se VE, que depende del lente y de
    // la pantalla: puesta a ojo quedaba fuera del cuadro.
    const lejos = 0.42;
    const medioAlto = lejos * Math.tan(THREE.MathUtils.degToRad(camara.fov / 2));
    // En el celular, más al centro: en la esquina está el botón de correr.
    mano.grupo.position.set(medioAlto * (w / h) * (op.movil ? 0.38 : 0.6), -medioAlto * 0.58, -lejos);
    mano.grupo.scale.setScalar(0.85);
    // El visor tapa el tercio de abajo con la descripción y los botones. En
    // vez de acomodar cada vista a mano, se corre el centro de la imagen hacia
    // arriba: lo que la cámara mira queda en la parte visible.
    camara.setViewOffset(w, h, 0, caminando ? 0 : h * (w / h < 0.8 ? 0.2 : 0.17), w, h);
    camara.updateProjectionMatrix();
  };
  const observador = new ResizeObserver(() => {
    ajustar();
    dibujar();
  });
  if (canvas.parentElement) observador.observe(canvas.parentElement);

  // ── Arranque ──
  ajustar();
  ponerHora("noche");
  verVista(predio.vistas[0]?.id ?? "", true);
  actualizar(0);
  dibujar();

  const reloj = new THREE.Clock();
  let raf = 0;
  const bucle = () => {
    raf = requestAnimationFrame(bucle);
    actualizar(Math.min(reloj.getDelta(), 0.05));
    dibujar();
  };
  raf = requestAnimationFrame(bucle);

  if (import.meta.env.DEV) {
    // Para probar con la pestaña oculta, donde requestAnimationFrame no corre.
    (window as unknown as { __croquis: unknown }).__croquis = {
      cuadro: (seg = 0.016) => {
        actualizar(seg);
        dibujar();
      },
      gente: gente.length,
      personaje: () => ({ x: yo.x, z: yo.z, yaw, caminando, zona: zonaActual }),
    };
  }

  return {
    verVista: (id, inmediato) => {
      verVista(id, inmediato);
      if (inmediato) {
        actualizar(0);
        dibujar();
      }
    },
    ponerHora: (h) => {
      ponerHora(h);
      dibujar();
    },
    caminar: (activo) => ponerCaminata(activo),
    pausar: (activo) => {
      pausado = activo;
      teclas.clear();
      palanca.x = palanca.y = 0;
      arrastre = null;
    },
    mover: (x, y) => {
      palanca.x = THREE.MathUtils.clamp(x, -1, 1);
      palanca.y = THREE.MathUtils.clamp(y, -1, 1);
    },
    correr: (activo) => {
      corriendo = activo;
    },
    liberar: () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", alApretar);
      window.removeEventListener("keyup", alSoltar);
      window.removeEventListener("blur", alPerderFoco);
      canvas.removeEventListener("pointerdown", alBajar);
      canvas.removeEventListener("pointermove", alMover);
      canvas.removeEventListener("pointerup", alSubir);
      canvas.removeEventListener("pointercancel", alSubir);
      observador.disconnect();
      controles.dispose();
      escena.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        for (const mat of mats) {
          (mat as THREE.MeshStandardMaterial).map?.dispose();
          mat.dispose();
        }
      });
      renderer.dispose();
    },
  };
}
