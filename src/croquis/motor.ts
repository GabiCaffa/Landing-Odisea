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
  /** Bailar en el lugar: la cámara rebota al ritmo y el vaso sube y baja. Moverse lo corta. */
  bailar(activo: boolean): void;
  /** Una pitada de cigarro (unos 5 s): la otra mano, la brasa y el humo. */
  fumar(): void;
  liberar(): void;
}

interface Opciones {
  movil: boolean;
  reducirMovimiento: boolean;
  /** Avisa la zona en la que se está parado al caminar (null = afuera). */
  onZona?: (zona: { id: string; nombre: string } | null) => void;
  /** Avisa cuando el mouse queda tomado para mirar (click en el mapa) o se suelta (Esc). */
  onMira?: (tomado: boolean) => void;
  /** Avisa cuando el baile se prende o se apaga solo (al moverse, con la tecla B). */
  onBaile?: (activo: boolean) => void;
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

/** Un canvas como textura que se repite. */
function texturaCanvas(w: number, h: number, dibujar: (ctx: CanvasRenderingContext2D) => void, color = true) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  dibujar(c.getContext("2d")!);
  const tex = new THREE.CanvasTexture(c);
  if (color) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Césped de cancha, como el de las fotos: verde con hojitas sueltas y las
 * franjas del corte. Cada repetición son 16 m (dos franjas de 8).
 */
function texturaPasto() {
  return texturaCanvas(512, 512, (ctx) => {
    ctx.fillStyle = "#5a8c43";
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = "#4d7c38";
    ctx.fillRect(0, 256, 512, 256);
    const r = azar(99);
    for (let k = 0; k < 14000; k++) {
      const x = r() * 512;
      const y = r() * 512;
      ctx.fillStyle = r() < 0.55 ? `rgba(28,58,20,${0.12 + r() * 0.18})` : `rgba(150,200,95,${0.06 + r() * 0.1})`;
      ctx.fillRect(x, y, 1 + r() * 1.4, 2 + r() * 3.5);
    }
  });
}

/** Cielo: un degradé de arriba al horizonte, y abajo el color del suelo lejano. */
function texturaCielo(arriba: string, medio: string, horizonte: string, abajo: string) {
  return texturaCanvas(4, 512, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, arriba);
    g.addColorStop(0.32, medio);
    g.addColorStop(0.497, horizonte);
    g.addColorStop(0.52, abajo);
    g.addColorStop(1, abajo);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 512);
  });
}

/** Truss de aluminio: dos largueros y la diagonal en zigzag, con fondo transparente. */
function texturaTruss() {
  return texturaCanvas(64, 128, (ctx) => {
    ctx.clearRect(0, 0, 64, 128);
    ctx.strokeStyle = "#e4e7ea";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(4, 128);
    ctx.moveTo(60, 0);
    ctx.lineTo(60, 128);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(60, 64);
    ctx.lineTo(4, 128);
    ctx.moveTo(4, 64);
    ctx.lineTo(60, 64);
    ctx.stroke();
  });
}

/** Valla de reja (las de contención): marco y barrotes, transparente entre medio. */
function texturaReja() {
  return texturaCanvas(128, 64, (ctx) => {
    ctx.clearRect(0, 0, 128, 64);
    ctx.fillStyle = "#c9ced4";
    ctx.fillRect(0, 0, 128, 6);
    ctx.fillRect(0, 58, 128, 6);
    ctx.fillRect(0, 0, 6, 64);
    for (let x = 16; x < 128; x += 12) ctx.fillRect(x, 0, 3, 64);
  });
}

/** Vallado azul del frente del escenario: paneles con su marco blanco. */
function texturaPanelesAzules() {
  return texturaCanvas(128, 128, (ctx) => {
    ctx.fillStyle = "#e9eef2";
    ctx.fillRect(0, 0, 128, 128);
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, "#2b9be8");
    g.addColorStop(1, "#1677c4");
    ctx.fillStyle = g;
    ctx.fillRect(6, 6, 116, 116);
  });
}

/** Chapa acanalada del contenedor. */
function texturaChapa() {
  return texturaCanvas(64, 64, (ctx) => {
    ctx.fillStyle = "#2f6fae";
    ctx.fillRect(0, 0, 64, 64);
    for (let x = 0; x < 64; x += 8) {
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(x, 0, 3, 64);
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.fillRect(x + 4, 0, 2, 64);
    }
  });
}


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
  escena.fog = new THREE.Fog(0x000000, 140, 560);
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

  // ── Cielo ──
  // Un domo con degradé hasta el horizonte (las fotos son de atardecer: violeta
  // arriba y naranja abajo). No lleva niebla: es el fondo.
  const cielos = {
    dia: texturaCielo("#4a82c4", "#8fc0ea", "#dcecf6", "#5d7f5a"),
    atardecer: texturaCielo("#3d3656", "#9a5f78", "#f08a3c", "#2e2a27"),
    noche: texturaCielo("#03050b", "#0c1430", "#2a2c4a", "#06070a"),
  };
  const domo = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 16),
    new THREE.MeshBasicMaterial({ map: cielos.noche, side: THREE.BackSide, fog: false, depthWrite: false })
  );
  escena.add(domo);

  // ── Piso: césped de cancha ──
  const texPasto = texturaPasto();
  texPasto.repeat.set(900 / 16, 900 / 16);
  const pasto = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    new THREE.MeshStandardMaterial({ map: texPasto, roughness: 0.95 })
  );
  pasto.rotation.x = -Math.PI / 2;
  pasto.receiveShadow = true;
  escena.add(pasto);

  const zonasMat: Record<string, THREE.MeshStandardMaterial> = {};
  // Caminando, el cartel de la zona se ve de lejos y no encima (arriba ya dice dónde se está).
  const cartelesZona: THREE.Sprite[] = [];
  predio.zonas.forEach((z, i) => {
    const forma = new THREE.Shape(z.poligono.map(([x, zz]) => new THREE.Vector2(x, -zz)));
    // El lugar es abierto y todo es césped: la zona es un tinte encima del
    // pasto, con el borde marcado, y no un piso de color.
    const mat = new THREE.MeshStandardMaterial({
      color: z.color,
      roughness: 0.9,
      emissive: z.color,
      emissiveIntensity: 0.05,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    });
    zonasMat[z.id] = mat;
    const piso = new THREE.Mesh(new THREE.ShapeGeometry(forma), mat);
    piso.rotation.x = -Math.PI / 2;
    piso.position.y = (z.altura ?? 0) + 0.03 + i * 0.012;
    piso.receiveShadow = true;
    escena.add(piso);
    const borde = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(z.poligono.map(([x, zz]) => new THREE.Vector3(x, 0.08 + i * 0.012, zz))),
      new THREE.LineBasicMaterial({ color: z.color, transparent: true, opacity: 0.8 })
    );
    escena.add(borde);
    if (z.etiqueta) {
      const s = cartel(z.nombre.toUpperCase(), 3.2, z.color);
      s.position.set(z.etiqueta[0], 6.5 + (z.altura ?? 0), z.etiqueta[1]);
      escena.add(s);
      cartelesZona.push(s);
    }
  });

  // ── Vallas y guirnaldas ──
  const metal = mate("#9aa0a8", { metalness: 0.4, roughness: 0.5 });
  const posicionesLuz: THREE.Vector3[] = [];
  const texReja = texturaReja();
  const mediaSombra = new THREE.MeshStandardMaterial({ color: "#16191b", roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.93 });
  const postes: { x: number; z: number; alto: number }[] = [];
  for (const v of predio.vallas) {
    if (v.invisible) continue; // sólo frena (ver `tramos`)
    const media = v.estilo === "media";
    const alto = media ? 2.1 : 1.15;
    for (let i = 0; i < v.puntos.length - 1; i++) {
      const [x1, z1] = v.puntos[i];
      const [x2, z2] = v.puntos[i + 1];
      const largo = Math.hypot(x2 - x1, z2 - z1);
      const giro = -Math.atan2(z2 - z1, x2 - x1);
      let lienzo: THREE.Mesh;
      if (media) {
        lienzo = new THREE.Mesh(new THREE.PlaneGeometry(largo, alto), mediaSombra);
      } else {
        const t = texReja.clone();
        t.needsUpdate = true;
        t.repeat.set(largo / 2.4, 1);
        lienzo = new THREE.Mesh(
          new THREE.PlaneGeometry(largo, alto),
          new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.45 })
        );
      }
      lienzo.position.set((x1 + x2) / 2, alto / 2, (z1 + z2) / 2);
      lienzo.rotation.y = giro;
      lienzo.castShadow = true;
      escena.add(lienzo);
      const pasos = Math.max(1, Math.round(largo / (media ? 3 : 2.4)));
      for (let k = 0; k <= pasos; k++) postes.push({ x: x1 + ((x2 - x1) * k) / pasos, z: z1 + ((z2 - z1) * k) / pasos, alto });
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
  // Los postes de todas las vallas, en una sola malla.
  const mPostes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 6), metal, Math.max(1, postes.length));
  const m4p = new THREE.Matrix4();
  postes.forEach((pp, i) => mPostes.setMatrixAt(i, m4p.compose(new THREE.Vector3(pp.x, pp.alto / 2, pp.z), new THREE.Quaternion(), new THREE.Vector3(1, pp.alto, 1))));
  mPostes.count = postes.length;
  escena.add(mPostes);

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
  // Banderas que flamean con el viento.
  const banderas: THREE.Mesh[] = [];
  const rayos: THREE.Object3D[] = [];
  const conCartel = (tipo: TipoPieza, texto: string, fondo: string, g: THREE.Group, alto: number) => {
    const s = cartel(texto, 1.9, fondo);
    s.position.set(0, alto, 0);
    s.visible = false;
    g.add(s);
    cartelesPieza.push({ tipo, sprite: s, x: 0, z: 0 });
  };

  /** La imagen de una pantalla LED: degradé rojo con el texto (una línea por `\n`). */
  function texturaPantalla(texto = "ODÍSEA") {
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
    const lineas = texto.split("\n");
    lineas.forEach((l, i) => ctx.fillText(l, 512, 256 + (i - (lineas.length - 1) / 2) * 125));
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /**
   * La fachada de la plaza de toros, como textura que se repite alrededor: el
   * arco de herradura abajo, dos ventanas arriba y la cornisa. Dos imágenes: el
   * color y lo que se prende de noche (el adentro de los arcos y las ventanas).
   */
  function texturasFachada(repeticiones: number) {
    const W = 256;
    const H = 400;
    const hacer = (noche: boolean) => {
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const ctx = c.getContext("2d")!;
      // De noche la pared también se prende un poco (está iluminada desde abajo).
      ctx.fillStyle = noche ? "#3a2814" : "#c7aa78";
      ctx.fillRect(0, 0, W, H);
      if (!noche) {
        // Hiladas de ladrillo claro y la cornisa.
        ctx.fillStyle = "rgba(90,60,30,0.10)";
        for (let y = 0; y < H; y += 14) ctx.fillRect(0, y, W, 2);
        ctx.fillStyle = "#b39062";
        ctx.fillRect(0, 34, W, 10);
        ctx.fillRect(0, 196, W, 8);
      }
      const hueco = noche ? "#ffb35c" : "#2a1d14";
      // Arco de herradura, abajo (de y=230 a 400).
      ctx.fillStyle = hueco;
      ctx.beginPath();
      ctx.moveTo(78, H);
      ctx.lineTo(78, 300);
      ctx.arc(128, 300, 56, Math.PI * 0.92, Math.PI * 0.08);
      ctx.lineTo(178, H);
      ctx.closePath();
      ctx.fill();
      // Dos ventanas de medio punto, arriba.
      for (const x of [86, 170]) {
        ctx.beginPath();
        ctx.moveTo(x - 17, 170);
        ctx.lineTo(x - 17, 100);
        ctx.arc(x, 100, 17, Math.PI, 0);
        ctx.lineTo(x + 17, 170);
        ctx.closePath();
        ctx.fill();
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.repeat.set(repeticiones, 1);
      return tex;
    };
    return { color: hacer(false), noche: hacer(true) };
  }

  // Escaleras: por dónde se sube caminando (ver `alturaEn`).
  const rampas: { x: number; z: number; rot: number; largo: number; ancho: number; altura: number }[] = [];

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
      // El escenario de las fotos: tarima, torres y techo de truss de aluminio,
      // techo negro, banderines negros colgando adelante, alas laterales con el
      // sonido colgado, y el vallado azul adelante. Mira al sur (+z).
      const g = new THREE.Group();
      const negro = mate("#141418", { flatShading: false, roughness: 0.8 });
      const tela = new THREE.MeshStandardMaterial({ color: "#111114", roughness: 1, side: THREE.DoubleSide });
      const texTruss = texturaTruss();
      const truss = (w: number, h: number, d: number, x: number, y: number, z: number) => {
        const largo = Math.max(w, h, d);
        const t = texTruss.clone();
        t.needsUpdate = true;
        t.repeat.set(1, largo / 1.1);
        if (largo === w) t.rotation = Math.PI / 2;
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.7, roughness: 0.35 })
        );
        m.position.set(x, y, z);
        return m;
      };
      // Tarima y faldón.
      g.add(caja(16, 1.4, 9, negro, 0, 0.7, 0));
      g.add(caja(16, 0.06, 9, mate("#2a2a30"), 0, 1.43, 0));
      for (let i = 0; i < 4; i++) g.add(caja(1.6, 0.35, 0.5, mate("#3a3a40"), -8.9, 0.18 + i * 0.35, 3.2 - i * 0.5));
      // Torres y techo.
      for (const sx of [-7.7, 7.7]) for (const sz of [-4.2, 4.2]) g.add(truss(0.5, 10.5, 0.5, sx, 5.25, sz));
      g.add(truss(16.4, 0.5, 0.5, 0, 10, 4.2));
      g.add(truss(16.4, 0.5, 0.5, 0, 10, -4.2));
      g.add(truss(0.5, 0.5, 8.9, -7.7, 10, 0));
      g.add(truss(0.5, 0.5, 8.9, 7.7, 10, 0));
      g.add(caja(17.4, 0.35, 10.2, negro, 0, 10.6, 0));
      // Alas laterales (como un arco de truss) con el sonido colgado.
      for (const sx of [-10.4, 10.4]) {
        g.add(truss(0.5, 9, 0.5, sx, 4.5, 3.6));
        g.add(truss(0.5, 9, 0.5, sx, 4.5, -1.2));
        g.add(truss(0.5, 0.5, 5.3, sx, 9, 1.2));
        for (let i = 0; i < 6; i++) {
          const caj = caja(1.3, 0.55, 0.9, negro, sx, 8.2 - i * 0.58, 2.4);
          caj.rotation.x = -0.04 * i;
          g.add(caj);
        }
        // Subwoofers en el piso, adelante.
        g.add(caja(1.6, 1.3, 1.2, negro, sx * 0.86, 0.65, 5.4));
        g.add(caja(1.6, 1.3, 1.2, negro, sx * 0.86, 1.95, 5.4));
      }
      // Banderines negros colgando del frente, como en las fotos.
      const tri = new THREE.Shape([new THREE.Vector2(-0.9, 0), new THREE.Vector2(0.9, 0), new THREE.Vector2(0, -3.4)]);
      for (let i = 0; i < 6; i++) {
        const b = new THREE.Mesh(new THREE.ShapeGeometry(tri), tela);
        b.position.set(-6.2 + i * 2.48, 9.7, 4.35);
        g.add(b);
      }
      // Cabina del DJ con su luz.
      g.add(caja(3.6, 1.1, 1.2, mate("#0f0f12"), 0, 1.98, 1.6));
      g.add(caja(3.6, 0.12, 0.05, brilla("#ff2a4a", 2), 0, 2.2, 2.22));
      // Luces colgadas del techo.
      const colores = ["#ff2a4a", "#ffd24a", "#38e8ff", "#ff2a4a", "#a855f7", "#ffffff"];
      colores.forEach((c, i) => g.add(caja(0.5, 0.45, 0.5, brilla(c, 2.2), -6.2 + i * 2.48, 9.45, 4.2)));
      // Haces de luz: se ven de noche y al atardecer, y se mueven.
      colores.slice(0, 5).forEach((c, i) => {
        const pivote = new THREE.Group();
        pivote.position.set(-5 + i * 2.5, 9.4, 4.2);
        const haz = new THREE.Mesh(
          new THREE.ConeGeometry(2.6, 20, 16, 1, true),
          new THREE.MeshBasicMaterial({
            color: c,
            transparent: true,
            opacity: 0.12,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        );
        haz.position.y = -10;
        pivote.add(haz);
        pivote.userData.fase = i * 1.3;
        g.add(pivote);
        rayos.push(pivote);
      });
      // Vallado azul delante del escenario.
      const panel = texturaPanelesAzules();
      panel.repeat.set(20, 1);
      g.add(
        new THREE.Mesh(
          new THREE.BoxGeometry(20, 1.2, 0.08),
          new THREE.MeshStandardMaterial({ map: panel, roughness: 0.6 })
        ).translateY(0.6).translateZ(6.6)
      );
      const s = cartel("DJ", 2.2, "#111114");
      s.position.set(0, 12.2, 0);
      g.add(s);
      // Para chocar alcanza con la tarima y las alas, no con el vallado de adelante.
      g.userData.solido = [22, 10.5, 0, 0];
      return g;
    },
    torreLuz: () => {
      // Torre de iluminación de cancha: poste alto y la cabeza con reflectores.
      const g = new THREE.Group();
      const galvanizado = mate("#a8adb3", { metalness: 0.6, roughness: 0.45, flatShading: false });
      const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 17, 10), galvanizado);
      poste.position.y = 8.5;
      g.add(poste);
      g.add(caja(3.2, 0.2, 0.3, galvanizado, 0, 16.4, 0.2));
      g.add(caja(3.2, 0.2, 0.3, galvanizado, 0, 17.4, 0.2));
      for (let i = 0; i < 4; i++) {
        const r = caja(0.7, 0.55, 0.25, brilla("#fff6dc", 1.8), -1.15 + i * 0.77, 16.9, 0.45);
        r.rotation.x = 0.35;
        g.add(r);
      }
      g.userData.solido = [1, 1, 0, 0];
      return g;
    },
    palosRugby: () => {
      // Los palos de rugby que se ven en las fotos (es una cancha).
      const g = new THREE.Group();
      const blanco = mate("#f2f2f2", { flatShading: false });
      for (const x of [-2.8, 2.8]) {
        const palo = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 12, 10), blanco);
        palo.position.set(x, 6, 0);
        g.add(palo);
      }
      const travesano = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 5.6, 10), blanco);
      travesano.rotation.z = Math.PI / 2;
      travesano.position.y = 3;
      g.add(travesano);
      return g;
    },
    contenedor: () => {
      const g = new THREE.Group();
      const chapa = texturaChapa();
      chapa.repeat.set(6, 1);
      const m = new THREE.Mesh(new THREE.BoxGeometry(12.2, 2.6, 2.44), new THREE.MeshStandardMaterial({ map: chapa, roughness: 0.55, metalness: 0.3 }));
      m.position.y = 1.3;
      g.add(m);
      g.add(caja(0.1, 2.5, 2.3, mate("#e8e8e8"), -6.12, 1.3, 0));
      return g;
    },
    bandera: (p) => {
      // Mástil con bandera vertical con el logo, como las de la entrada.
      const g = new THREE.Group();
      const mastil = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 7.5, 8), mate("#dcdcdc", { flatShading: false }));
      mastil.position.y = 3.75;
      g.add(mastil);
      const { tex } = texturaTexto(p.texto ?? "ODÍSEA", { fondo: "#f4f4f4", color: "#111114", redondo: false, alto: 120 });
      const tela = new THREE.Mesh(
        new THREE.PlaneGeometry(1.1, 3.2),
        new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.9 })
      );
      // El texto va a lo largo de la bandera, que cuelga vertical.
      tex.center.set(0.5, 0.5);
      tex.rotation = Math.PI / 2;
      tela.position.set(0.6, 5.6, 0);
      tela.userData.flamea = true;
      g.add(tela);
      banderas.push(tela);
      return g;
    },
    pantalla: (p) => {
      const g = new THREE.Group();
      g.add(caja(12.4, 7, 0.5, mate("#151518"), 0, 5, 0));
      for (const x of [-4, 4]) g.add(caja(0.4, 1.6, 0.4, mate("#151518"), x, 0.8, 0));
      const tex = texturaPantalla(p.texto);
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
    /**
     * Una plaza de toros: el muro del ruedo (con el hueco del ingreso al sur), las
     * gradas en escalones, la galería, la fachada circular con arcos y almenas, el
     * techo de la mitad del frente, los reflectores y la torre de la entrada.
     * Centrada en (x, z); el ruedo mide `radio`. Todo de geometría simple: no es
     * un modelo escaneado, es un croquis.
     */
    plazaToros: (p) => {
      const g = new THREE.Group();
      const R = p.radio ?? 26;
      const R0 = R + 1.6; // el callejón, entre el muro y la primera grada
      const ESCALONES = 16;
      const PASO = 1;
      const SUBE = 0.55;
      const BASE = 1.8;
      const RT = R0 + ESCALONES * PASO; // donde terminan las gradas
      const RF = RT + 3.5; // la fachada
      const ALTO = 15;
      const ARRIBA = BASE + ESCALONES * SUBE; // piso de la galería
      const HUECO = 0.1; // medio ángulo del ingreso, al sur
      const VUELTA = Math.PI * 2 - 2 * HUECO;
      const doble = { side: THREE.DoubleSide };
      // Propios: los de afuera (q, pos, esc, unir) se declaran más abajo.
      const giro = new THREE.Quaternion();
      const lugar = new THREE.Vector3();
      const uno = new THREE.Vector3(1, 1, 1);
      const juntar = (gs: THREE.BufferGeometry[]) => mergeGeometries(gs) ?? gs[0];

      // Muro del ruedo, con el hueco del ingreso.
      const muro = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 1.6, 96, 1, true, HUECO, VUELTA), mate("#7a2e1f", doble));
      muro.position.y = 0.8;
      g.add(muro);
      const tapa = new THREE.RingGeometry(R, R + 0.3, 96, 1, 1.5 * Math.PI + HUECO, VUELTA);
      tapa.rotateX(-Math.PI / 2);
      tapa.translate(0, 1.61, 0);
      g.add(new THREE.Mesh(tapa, mate("#5a2016")));

      // Gradas: huellas (los asientos, gris claro) y contrahuellas.
      const huellas: THREE.BufferGeometry[] = [];
      const contras: THREE.BufferGeometry[] = [];
      for (let i = 0; i < ESCALONES; i++) {
        const r1 = R0 + i * PASO;
        const y = BASE + i * SUBE;
        // Un RingGeometry acostado: su ángulo 1,5π cae al sur (+z).
        const h = new THREE.RingGeometry(r1, r1 + PASO, 96, 1, 1.5 * Math.PI + HUECO, VUELTA);
        h.rotateX(-Math.PI / 2);
        h.translate(0, y, 0);
        huellas.push(h);
        const altoC = i === 0 ? y : SUBE;
        // Un CylinderGeometry arranca en +z (sur): el hueco queda centrado ahí.
        const c = new THREE.CylinderGeometry(r1, r1, altoC, 96, 1, true, HUECO, VUELTA);
        c.translate(0, y - altoC / 2, 0);
        contras.push(c);
      }
      const asientos = new THREE.Mesh(juntar(huellas), mate("#c4c8cf", doble));
      asientos.receiveShadow = true;
      g.add(asientos, new THREE.Mesh(juntar(contras), mate("#8d9096", doble)));
      // El túnel del ingreso, por debajo de las gradas.
      g.add(caja(2 * R0 * Math.sin(HUECO) + 0.6, 4.2, RF - R + 1, mate("#17110d"), 0, 2.1, (R + RF) / 2));

      // Galería: piso y la fachada (vista de los dos lados: de adentro se ven sus arcos arriba de las gradas).
      const galeria = new THREE.RingGeometry(RT, RF, 96);
      galeria.rotateX(-Math.PI / 2);
      galeria.translate(0, ARRIBA, 0);
      g.add(new THREE.Mesh(galeria, mate("#a89a86", doble)));
      const { color, noche } = texturasFachada(Math.round((2 * Math.PI * RF) / 9.5));
      const matFachada = new THREE.MeshStandardMaterial({
        map: color,
        emissive: "#ffffff",
        emissiveMap: noche,
        emissiveIntensity: 1,
        roughness: 0.9,
        side: THREE.DoubleSide,
      });
      emisivos.push({ mat: matFachada, base: 1 });
      const fachada = new THREE.Mesh(new THREE.CylinderGeometry(RF, RF, ALTO, 128, 1, true), matFachada);
      fachada.position.y = ALTO / 2;
      g.add(fachada);

      // Almenas arriba de la fachada.
      const arena = mate("#c7aa78");
      const nAlmenas = Math.floor((2 * Math.PI * RF) / 2.4);
      const almenas = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 1.2, 0.8), arena, nAlmenas);
      for (let i = 0; i < nAlmenas; i++) {
        const a = (i / nAlmenas) * Math.PI * 2;
        giro.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
        almenas.setMatrixAt(i, m4.compose(lugar.set(Math.sin(a) * RF, ALTO + 0.6, Math.cos(a) * RF), giro, uno));
      }
      g.add(almenas);

      // El techo oscuro sobre la mitad del frente (la que da a la entrada).
      const techo = new THREE.RingGeometry(RT - 3, RF + 0.4, 64, 1, Math.PI, Math.PI);
      techo.rotateX(-Math.PI / 2);
      techo.translate(0, ALTO - 0.2, 0);
      g.add(new THREE.Mesh(techo, mate("#1d2621", doble)));

      // Reflectores alrededor, arriba de las gradas.
      const nLuces = 44;
      const reflectores = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.35, 0.5), brilla("#fff6dc", 2.6), nLuces);
      for (let i = 0; i < nLuces; i++) {
        const a = (i / nLuces) * Math.PI * 2;
        reflectores.setMatrixAt(i, m4.makeTranslation(Math.sin(a) * (RT - 0.5), ALTO - 1.4, Math.cos(a) * (RT - 0.5)));
      }
      g.add(reflectores);

      // La torre de la entrada (con su gran arco) y dos torres a los costados.
      const torre = new THREE.Group();
      torre.add(caja(16, 18, 8, arena, 0, 9, 0));
      const arco = new THREE.Shape();
      arco.moveTo(-3.2, 0);
      arco.lineTo(-3.2, 8);
      arco.absarc(0, 8, 3.2, Math.PI, 0, true);
      arco.lineTo(3.2, 0);
      arco.closePath();
      const boca = new THREE.Mesh(new THREE.ShapeGeometry(arco), brilla("#ffb35c", 0.9, { side: THREE.DoubleSide }));
      boca.position.set(0, 0.05, 4.03);
      torre.add(boca);
      for (let i = 0; i < 7; i++) torre.add(caja(1.1, 1.2, 0.8, arena, -6.6 + i * 2.2, 18.6, 3.6));
      torre.position.set(0, 0, RF + 2.5);
      g.add(torre);
      for (const lado of [-1, 1]) {
        const a = lado * 0.95;
        const t = caja(7, 17, 7, arena, Math.sin(a) * (RF + 1.5), 8.5, Math.cos(a) * (RF + 1.5));
        t.rotation.y = a;
        g.add(t);
      }

      // La explanada de afuera (baldosas rojizas con sus líneas) y la calle.
      const anillo = (r1: number, r2: number, colorPiso: string, y: number) => {
        const m = new THREE.Mesh(new THREE.RingGeometry(r1, r2, 96), mate(colorPiso));
        m.rotation.x = -Math.PI / 2;
        m.position.y = y;
        m.receiveShadow = true;
        g.add(m);
      };
      anillo(RF, RF + 16, "#b37a5e", 0.015);
      anillo(RF + 6, RF + 6.3, "#efe6d8", 0.02);
      anillo(RF + 15.7, RF + 16, "#efe6d8", 0.02);
      anillo(RF + 16, RF + 23, "#2a2a2d", 0.012);
      return g;
    },
    /**
     * Escenario grande: tarima con su borde de luz, cabina del DJ adelante al
     * centro, columnas de sonido, techo con estructura, pantalla atrás y haces de
     * luz. Con `elevado`, la parte de atrás es más alta (el VIP), con baranda de
     * vidrio. Centrado en (x, z); su frente mira al sur con rot 0.
     */
    escenario: (p) => {
      const g = new THREE.Group();
      const W = p.largo ?? 20;
      const D = p.fondo ?? 12;
      const H = p.altura ?? 1.6;
      const negro = mate("#141417");
      g.add(caja(W, H, D, negro, 0, H / 2, 0));
      g.add(caja(W, 0.1, 0.06, brilla("#ff2a4a", 1.6), 0, H - 0.12, D / 2 + 0.04));
      let fondoLibre = D;
      if (p.elevado) {
        const e = p.elevado;
        const zc = -D / 2 + e.fondo / 2;
        const frente = -D / 2 + e.fondo;
        g.add(caja(W, e.altura - H, e.fondo, mate("#1d1d22"), 0, H + (e.altura - H) / 2, zc));
        const vidrio = new THREE.MeshStandardMaterial({ color: "#9fd3ff", transparent: true, opacity: 0.28, roughness: 0.1 });
        g.add(caja(W, 1.1, 0.06, vidrio, 0, e.altura + 0.55, frente));
        g.add(caja(0.06, 1.1, e.fondo, vidrio, -W / 2, e.altura + 0.55, zc));
        g.add(caja(W, 0.06, 0.09, brilla("#ffd24a", 1.2), 0, e.altura + 1.1, frente));
        fondoLibre = D - e.fondo;
      }
      // DJ, adelante al centro.
      const zDj = D / 2 - Math.min(2.2, fondoLibre / 2);
      g.add(caja(3.6, 1.1, 1.2, mate("#0f0f12"), 0, H + 0.55, zDj));
      g.add(caja(3.6, 0.12, 0.05, brilla("#ff2a4a", 2), 0, H + 0.95, zDj + 0.62));
      // Columnas de sonido en las puntas del frente.
      for (const sx of [-1, 1]) g.add(caja(1.4, 3.4, 1.3, mate("#0b0b0d"), sx * (W / 2 - 0.9), H + 1.7, D / 2 - 0.9));
      // Techo: cuatro torres de estructura, el marco y la cubierta.
      const truss = mate("#3b3b42", { metalness: 0.6, roughness: 0.4 });
      const TECHO = 12.5;
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) g.add(caja(0.5, TECHO, 0.5, truss, sx * (W / 2 + 0.4), TECHO / 2, sz * (D / 2 + 0.4)));
      g.add(caja(W + 1.4, 0.45, 0.45, truss, 0, TECHO, D / 2 + 0.4));
      g.add(caja(W + 1.4, 0.45, 0.45, truss, 0, TECHO, -D / 2 - 0.4));
      g.add(caja(W + 1.8, 0.35, D + 1.8, mate("#18181c"), 0, TECHO + 0.45, 0));
      // Pantalla al fondo, por encima de la gente del VIP.
      const tex = texturaPantalla(p.texto);
      const ancho = W - 3;
      g.add(caja(ancho + 0.6, ancho / 2.6 + 0.6, 0.4, mate("#151518"), 0, TECHO - 1.4 - ancho / 5.2, -D / 2 - 0.3));
      const pantalla = new THREE.Mesh(new THREE.PlaneGeometry(ancho, ancho / 2.6), brilla("#ffffff", 1, { map: tex, emissiveMap: tex }));
      pantalla.position.set(0, TECHO - 1.4 - ancho / 5.2, -D / 2 - 0.08);
      g.add(pantalla);
      // Haces de luz desde el frente del techo.
      ["#ff2a4a", "#ffd24a", "#38e8ff", "#a855f7", "#ff2a4a"].forEach((c, i) => {
        g.add(caja(0.5, 0.4, 0.5, brilla(c, 2.2), -W / 2 + 2 + i * ((W - 4) / 4), TECHO - 0.5, D / 2 + 0.4));
        const pivote = new THREE.Group();
        pivote.position.set(-W / 2 + 2 + i * ((W - 4) / 4), TECHO - 0.6, D / 2 + 0.4);
        const haz = new THREE.Mesh(
          new THREE.ConeGeometry(3, 22, 16, 1, true),
          new THREE.MeshBasicMaterial({
            color: c,
            transparent: true,
            opacity: 0.12,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        );
        haz.position.y = -11;
        pivote.add(haz);
        pivote.userData.fase = i * 1.3;
        g.add(pivote);
        rayos.push(pivote);
      });
      const s = cartel("ESCENARIO", 2.2, "#111114");
      s.position.set(0, TECHO + 2.2, 0);
      g.add(s);
      return g;
    },
    /**
     * Escalera recta: sube `altura` metros a lo largo de `largo`, hacia el norte
     * (-z) con rot 0. Además de dibujarse, se anota en `rampas` para que al
     * caminar por ella la cámara suba.
     */
    escalera: (p) => {
      const g = new THREE.Group();
      const L = p.largo ?? 8;
      const A = p.fondo ?? 2.4;
      const H = p.altura ?? 2;
      const n = Math.max(4, Math.round(H / 0.18));
      const huella = L / n;
      const sube = H / n;
      const gris = mate("#2c2c31");
      for (let i = 0; i < n; i++) {
        const alto = (i + 1) * sube;
        g.add(caja(A, alto, huella, gris, 0, alto / 2, L / 2 - (i + 0.5) * huella));
      }
      // Baranda del lado de afuera, con luz.
      const largoB = Math.hypot(L, H);
      const baranda = caja(0.08, 0.08, largoB, brilla("#ffd24a", 1.2), A / 2, H / 2 + 1, 0);
      baranda.rotation.x = Math.atan2(H, L);
      g.add(baranda);
      rampas.push({ x: p.x, z: p.z, rot: ((p.rot ?? 0) * Math.PI) / 180, largo: L, ancho: A, altura: H });
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

  // ── Árboles alrededor ──
  // Como en las fotos: pinos y cipreses altos y oscuros, y árboles de copa
  // ancha. Todo instanciado (cuatro mallas para más de cien árboles).
  const nArboles = op.movil ? 70 : 130;
  const troncos = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.4, 1, 6), mate("#4a3322"), nArboles);
  const conos = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 8), mate("#1f4a2a"), nArboles);
  const conos2 = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 8), mate("#24522e"), nArboles);
  const copas = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mate("#2f5d2a"), nArboles);
  const tonosCopa = ["#2f5d2a", "#3a6b30", "#284f24", "#355f2c"].map((c) => new THREE.Color(c));
  const q = new THREE.Quaternion();
  const esc = new THREE.Vector3();
  const pos = new THREE.Vector3();
  let nPinos = 0;
  let nCopas = 0;
  let puestos = 0;
  for (let intento = 0; puestos < nArboles && intento < nArboles * 30; intento++) {
    const x = minX - 110 + sorteo() * (maxX - minX + 220);
    const z = minZ - 110 + sorteo() * (maxZ - minZ + 220);
    if (x > minX - 16 && x < maxX + 16 && z > minZ - 16 && z < maxZ + 16) continue;
    // Sin árboles adentro de un edificio redondo (la Plaza de Toros).
    if (predio.radioLibre && Math.hypot(x - (minX + maxX) / 2, z - (minZ + maxZ) / 2) < predio.radioLibre) continue;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), sorteo() * Math.PI);
    if (sorteo() < 0.6) {
      // Pino o ciprés: alto y angosto.
      const alto = 9 + sorteo() * 9;
      const ancho = 1.6 + sorteo() * 1.6;
      troncos.setMatrixAt(puestos, m4.compose(pos.set(x, alto * 0.12, z), q, esc.set(1, alto * 0.24, 1)));
      conos.setMatrixAt(nPinos, m4.compose(pos.set(x, alto * 0.5, z), q, esc.set(ancho, alto * 0.62, ancho)));
      conos2.setMatrixAt(nPinos, m4.compose(pos.set(x, alto * 0.76, z), q, esc.set(ancho * 0.72, alto * 0.48, ancho * 0.72)));
      nPinos++;
    } else {
      const s = 3 + sorteo() * 2.8;
      troncos.setMatrixAt(puestos, m4.compose(pos.set(x, s * 0.55, z), q, esc.set(1.2, s * 1.1, 1.2)));
      copas.setMatrixAt(nCopas, m4.compose(pos.set(x, s * 1.55, z), q, esc.set(s, s * 0.85, s)));
      copas.setColorAt(nCopas, tonosCopa[nCopas % tonosCopa.length]);
      nCopas++;
    }
    puestos++;
  }
  troncos.count = puestos;
  conos.count = nPinos;
  conos2.count = nPinos;
  copas.count = nCopas;
  conos.castShadow = conos2.castShadow = copas.castShadow = true;
  escena.add(troncos, conos, conos2, copas);

  // ── Gente ──
  // Cada persona son piezas de malla instanciada: piernas (con zapatillas),
  // remera con brazos, piel (cabeza, cuello y manos) y pelo. Hay dos posturas
  // —brazos abajo y brazos arriba bailando—, cada una con su remera y su piel.
  // Seis llamadas de dibujo para cientos de personas. Al caminar en primera
  // persona se las ve de cerca: por eso dejaron de ser un cilindro con una bola.
  interface Persona {
    x: number;
    /** Altura del piso donde está parada (una zona elevada). */
    y: number;
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
        y: z.altura ?? 0,
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
      m4.compose(pos.set(pp.x, pp.y + salto, pp.z), q, esc.setScalar(pp.escala));
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
  soporte.add(mano.grupo, mano.izquierda, mano.humo);
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
  const SOLIDOS = new Set<TipoPieza>(["barra", "banos", "auxilios", "pantalla", "arbolNavidad", "contenedor"]);
  const obstaculos: [number, number, number, number][] = [];
  for (const { tipo, g } of gruposPieza) {
    if (g.userData.solido) {
      const [w, d, cx, cz] = g.userData.solido as number[];
      const caja3 = new THREE.Box3();
      g.updateMatrixWorld(true);
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        caja3.expandByPoint(new THREE.Vector3(cx + (sx * w) / 2, 0, cz + (sz * d) / 2).applyMatrix4(g.matrixWorld));
      }
      obstaculos.push([caja3.min.x - 0.3, caja3.max.x + 0.3, caja3.min.z - 0.3, caja3.max.z + 0.3]);
      continue;
    }
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
  // La gente NO frena: se la atraviesa. Chocar con cada persona hacía la
  // caminata trabada, y el mapa es para recorrer el lugar.
  const ocupado = (x: number, z: number) => obstaculos.some(([a, b, c, d]) => x > a && x < b && z > c && z < d);
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
  let bailando = false;
  const ponerBaile = (activo: boolean) => {
    if (activo === bailando) return;
    bailando = activo;
    mano.bailar(activo);
    op.onBaile?.(activo);
  };
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

  /**
   * Altura del piso en un punto: la de la zona (el VIP arriba del escenario) o,
   * sobre una escalera, lo que haya subido hasta ahí. A una zona elevada sólo se
   * llega por su escalera: lo demás lo cierran las vallas.
   */
  const alturaEn = (x: number, z: number): number => {
    let h = zonaDe(x, z)?.altura ?? 0;
    for (const r of rampas) {
      const dx = x - r.x;
      const dz = z - r.z;
      // Al sistema de la escalera: lz crece hacia abajo (+z con rot 0).
      const lx = dx * Math.cos(r.rot) - dz * Math.sin(r.rot);
      const lz = dx * Math.sin(r.rot) + dz * Math.cos(r.rot);
      // Un poco de rellano arriba, para pasar de la escalera al piso alto sin bajón.
      if (Math.abs(lx) > r.ancho / 2 + 0.3 || lz > r.largo / 2 || lz < -r.largo / 2 - 2) continue;
      h = Math.max(h, r.altura * THREE.MathUtils.clamp((r.largo / 2 - lz) / r.largo, 0, 1));
    }
    return h;
  };
  let piso = 0;

  const TECLAS_JUEGO = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"]);
  const alApretar = (e: KeyboardEvent) => {
    if (!caminando || pausado) return;
    const destino = e.target as HTMLElement | null;
    if (destino && /input|textarea|select/i.test(destino.tagName)) return;
    // B baila, F fuma: atajos de los botones de la pantalla.
    if (e.code === "KeyB" && !e.repeat) return ponerBaile(!bailando);
    if (e.code === "KeyF" && !e.repeat) return mano.fumar();
    if (!TECLAS_JUEGO.has(e.code)) return;
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
  // Con mouse: un click en el mapa lo "toma" (Pointer Lock) y la vista sigue
  // al mouse sin mantener apretado, como en cualquier juego; Esc lo suelta.
  // Con el dedo, se arrastra.
  const tomado = () => document.pointerLockElement === canvas;
  const alBajar = (e: PointerEvent) => {
    if (!caminando || pausado) return;
    if (e.pointerType === "mouse" && canvas.requestPointerLock) {
      if (!tomado()) {
        try {
          // `unadjustedMovement` saca la aceleración del sistema (en Chrome): la
          // vista responde pareja. Si el navegador no lo acepta, se pide sin eso.
          const r = (canvas.requestPointerLock as (o?: unknown) => Promise<void> | void)({ unadjustedMovement: true });
          if (r && typeof (r as Promise<void>).catch === "function") (r as Promise<void>).catch(() => canvas.requestPointerLock());
        } catch {
          canvas.requestPointerLock();
        }
      }
      return;
    }
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
  const alMoverMouse = (e: MouseEvent) => {
    if (!tomado() || !caminando || pausado) return;
    // Algunos navegadores mandan de vez en cuando un salto enorme: se recorta.
    const dx = THREE.MathUtils.clamp(e.movementX, -120, 120);
    const dy = THREE.MathUtils.clamp(e.movementY, -120, 120);
    yaw -= dx * 0.0022;
    pitch = THREE.MathUtils.clamp(pitch - dy * 0.0022, -1.1, 0.9);
  };
  const alCambiarToma = () => op.onMira?.(tomado());
  const soltarMouse = () => {
    if (tomado()) document.exitPointerLock();
  };
  document.addEventListener("mousemove", alMoverMouse);
  document.addEventListener("pointerlockchange", alCambiarToma);
  canvas.addEventListener("pointerdown", alBajar);
  canvas.addEventListener("pointermove", alMover);
  canvas.addEventListener("pointerup", alSubir);
  canvas.addEventListener("pointercancel", alSubir);

  const mirar = new THREE.Vector3();
  const vel = { x: 0, z: 0 };
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

    // La velocidad se acerca de a poco a la pedida: arranca y frena suave,
    // sin el tirón de pasar de 0 a 3,6 m/s en un cuadro.
    let objX = 0;
    let objZ = 0;
    if (fuerza > 0.08) {
      // Caminar corta el baile.
      if (bailando) ponerBaile(false);
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      // Derecha de "adelante" (fx, fz) es (-fz, fx).
      const ax = fx * iy - fz * ix;
      const az = fz * iy + fx * ix;
      const n = Math.hypot(ax, az) || 1;
      const velocidad = (rapido ? 7 : 3.6) * fuerza;
      objX = (ax / n) * velocidad;
      objZ = (az / n) * velocidad;
    }
    const k = 1 - Math.exp(-dt * 10);
    vel.x += (objX - vel.x) * k;
    vel.z += (objZ - vel.z) * k;
    if (Math.abs(vel.x) < 0.01 && Math.abs(vel.z) < 0.01 && fuerza <= 0.08) vel.x = vel.z = 0;

    if (vel.x !== 0 || vel.z !== 0) {
      const dx = vel.x * dt;
      const dz = vel.z * dt;
      const x0 = yo.x;
      const z0 = yo.z;
      // Si algo tapa el paso, se prueba el mismo paso girado a un lado y al
      // otro, cada vez más: contra una valla o una barra es deslizarse por ella.
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
    // Subir o bajar (la escalera del VIP) se acompaña, no salta.
    const objetivo = alturaEn(yo.x, yo.z);
    piso = dt > 0 ? piso + (objetivo - piso) * Math.min(1, dt * 10) : objetivo;
    // Bailando: rebote al ritmo (~124 bpm) y un vaivén de la cabeza.
    const baile = bailando && !quietos ? Math.abs(Math.sin(t * 6.5)) * 0.07 : 0;
    camara.position.set(yo.x, piso + OJOS + bamboleo + baile, yo.z);
    mirar.set(
      yo.x + Math.sin(yaw) * Math.cos(pitch),
      piso + OJOS + bamboleo + baile + Math.sin(pitch),
      yo.z + Math.cos(yaw) * Math.cos(pitch)
    );
    camara.lookAt(mirar);
    if (bailando && !quietos) camara.rotateZ(Math.sin(t * 3.25) * 0.04);
    mano.animar(t, quietos ? 0 : paso, dt);

    // Se ven sólo los carteles de lo que está cerca: con todos prendidos
    // (atraviesan todo) se amontonaban.
    for (const c of cartelesPieza) {
      const ddx = c.x - yo.x;
      const ddz = c.z - yo.z;
      const d2 = ddx * ddx + ddz * ddz;
      c.sprite.visible = d2 < 22 * 22 && d2 > 7 * 7;
    }
    for (const s of cartelesZona) {
      const d2 = (s.position.x - yo.x) ** 2 + (s.position.z - yo.z) ** 2;
      s.visible = d2 > 20 * 20;
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
    if (!activo) ponerBaile(false);
    pausado = false;
    teclas.clear();
    palanca.x = palanca.y = 0;
    vel.x = vel.z = 0;
    arrastre = null;
    viaje = 1;
    if (!activo) {
      soltarMouse();
      for (const s of cartelesZona) s.visible = true;
    }
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
    (domo.material as THREE.MeshBasicMaterial).map = cielos[hora];
    (domo.material as THREE.MeshBasicMaterial).needsUpdate = true;
    // La niebla toma el color del horizonte, así lo lejano se funde con el cielo.
    (escena.fog as THREE.Fog).color.set({ dia: "#cfe3f2", atardecer: "#8f5f66", noche: "#0c1020" }[hora]);
    escena.background = new THREE.Color(H.fondo);
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
      for (const [i, b] of banderas.entries()) b.rotation.y = Math.sin(t * 1.6 + i) * 0.35;
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
    // La mano del cigarro, abajo a la izquierda (sube hasta la boca al fumar).
    mano.izquierda.position.set(-medioAlto * (w / h) * (op.movil ? 0.3 : 0.45), -medioAlto * 0.62, -lejos);
    mano.izquierda.scale.setScalar(0.85);
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
      personaje: () => ({ x: yo.x, z: yo.z, y: piso, yaw, caminando, zona: zonaActual }),
      // Para entender por qué no se puede pasar por un lugar.
      obstaculos,
      ocupado,
      choca,
      mano,
      // Frena el bucle para sacar una captura de un momento exacto.
      congelar: () => cancelAnimationFrame(raf),
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
      if (activo) soltarMouse();
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
    bailar: (activo) => ponerBaile(activo),
    fumar: () => mano.fumar(),
    liberar: () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", alApretar);
      window.removeEventListener("keyup", alSoltar);
      window.removeEventListener("blur", alPerderFoco);
      soltarMouse();
      document.removeEventListener("mousemove", alMoverMouse);
      document.removeEventListener("pointerlockchange", alCambiarToma);
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
