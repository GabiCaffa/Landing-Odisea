import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone as clonarConEsqueleto } from "three/examples/jsm/utils/SkeletonUtils.js";

/**
 * La gente "de verdad" del croquis: personajes con cara, pelo y animaciones
 * (bailar, charlar, quedarse quieto), hechos a partir de los paquetes gratis de
 * Quaternius (CC0): Universal Base Characters y Universal Animation Library.
 * Los archivos están en `public/croquis/gente/` y se arman con
 * `scripts/armar-personas.mjs` (ver CLAUDE.md).
 *
 * Cómo se reparte con la gente de siempre:
 * - **La multitud sigue siendo la malla instanciada del motor**: cientos de
 *   personas en seis llamadas de dibujo. Un personaje animado cuesta cuatro
 *   llamadas y su esqueleto se calcula en cada cuadro, así que no puede haber
 *   cientos.
 * - **Las más cercanas a la cámara se cambian por personajes** (40 en
 *   escritorio, 14 en el celular). El motor elige cuáles cada un cuarto de
 *   segundo; acá se reparte un grupo fijo de personajes entre ellas, y la
 *   persona instanciada de ese lugar se esconde. Caminando, la gente que se
 *   cruza de cerca siempre tiene cara.
 * - **La ropa se pinta por código.** Los cuerpos gratis vienen en ropa
 *   interior y no hay ropa de calle gratis del mismo autor. Cada vértice se
 *   clasifica por el hueso que más lo mueve (torso y brazos = remera, cadera y
 *   piernas = pantalón, pies = zapatillas) y el sombreador lo pinta del color
 *   de esa persona, conservando las sombras pintadas en la textura.
 * - **Nada de esto se baja si no se abre el mapa** (el motor ya va aparte), y
 *   si los archivos no cargan, el mapa sigue con la gente de siempre.
 */

export type AccionGente = "bailar" | "quieto" | "charlar" | "brindar";

/** Lo que el motor sabe de cada persona de la multitud. */
export interface Figurante {
  x: number;
  y: number;
  z: number;
  giro: number;
  escala: number;
  /** 0 = hombre, 1 = mujer. */
  genero: 0 | 1;
  peinado: number;
  barba: boolean;
  remera: THREE.Color;
  pantalon: THREE.Color;
  piel: THREE.Color;
  pelo: THREE.Color;
  /** Pantalón corto (bermuda o pollera corta): la pantorrilla va con piel. */
  corto: boolean;
  accion: AccionGente;
  /** 0..1: en qué punto de la animación arranca, para que no se muevan todos igual. */
  fase: number;
  /** Lo pone este módulo: la persona está dibujada con un personaje. */
  real?: boolean;
}

export interface GenteReal {
  /** Cuántos personajes hay como máximo. */
  readonly tope: number;
  /** `cercanas`: las personas más cerca de la cámara, la más cercana primero. */
  elegir(cercanas: Figurante[]): void;
  actualizar(dt: number): void;
  /**
   * Luz propia, de 0 a 1. De noche el predio está oscuro salvo los focos y los
   * personajes quedaban negros; un poco de luz propia los hace legibles (como
   * a la gente de una fiesta, que siempre tiene alguna luz encima).
   */
  ponerRelleno(valor: number): void;
  liberar(): void;
}

const BASE = "/croquis/gente/";
/** Peinados por género (nombres de las mallas de `pelos.glb`). */
const PEINADOS: [string[], string[]] = [
  ["Hair_Buzzed", "Hair_SimpleParted", "Hair_Long", "Hair_Buzzed"],
  ["Hair_Long", "Hair_Buns", "Hair_BuzzedFemale", "Hair_Long"],
];
export const CANT_PEINADOS = 4;

// Qué parte de la ropa es cada hueso: 0 piel, 1 remera, 2 pantalón, 3 pantorrilla, 4 zapatilla.
const ropaDeHueso = (nombre: string): number => {
  if (/^(spine|clavicle|upperarm)/.test(nombre)) return 1;
  if (/^(pelvis|thigh|root)/.test(nombre)) return 2;
  if (/^calf/.test(nombre)) return 3;
  if (/^(foot|ball)/.test(nombre)) return 4;
  return 0;
};

/** Le agrega a la malla del cuerpo el atributo `ropa` según el hueso que más mueve cada vértice. */
function marcarRopa(malla: THREE.SkinnedMesh) {
  const geo = malla.geometry;
  if (geo.getAttribute("ropa")) return;
  const idx = geo.getAttribute("skinIndex");
  const peso = geo.getAttribute("skinWeight");
  const huesos = malla.skeleton.bones.map((b) => ropaDeHueso(b.name));
  const ropa = new Float32Array(idx.count);
  for (let i = 0; i < idx.count; i++) {
    let mejor = 0;
    let max = -1;
    for (let k = 0; k < 4; k++) {
      const w = peso.getComponent(i, k);
      if (w > max) {
        max = w;
        mejor = idx.getComponent(i, k);
      }
    }
    ropa[i] = huesos[mejor] ?? 0;
  }
  geo.setAttribute("ropa", new THREE.BufferAttribute(ropa, 1));
}

/** Material del cuerpo: la textura de piel teñida, y la ropa pintada encima. */
/** Compartido por todos los cuerpos: la luz propia de noche (`ponerRelleno`). */
const relleno = { value: 0 };

function materialCuerpo(mapa: THREE.Texture | null) {
  const mat = new THREE.MeshStandardMaterial({ map: mapa, roughness: 0.78, metalness: 0 });
  const u = {
    uRemera: { value: new THREE.Color() },
    uPantalon: { value: new THREE.Color() },
    uZapas: { value: new THREE.Color() },
    uPiel: { value: new THREE.Color() },
    uCorto: { value: 0 },
    uRelleno: relleno,
  };
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float ropa;\nvarying float vRopa;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRopa = ropa;");
    s.fragmentShader = s.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vRopa;\nuniform vec3 uRemera;\nuniform vec3 uPantalon;\nuniform vec3 uZapas;\nuniform vec3 uPiel;\nuniform float uCorto;\nuniform float uRelleno;"
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        {
          float r = floor(vRopa + 0.5);
          // Las sombras pintadas en la textura (pliegues, músculos) se conservan
          // como luz y sombra sobre la tela, más suaves.
          float luz = clamp(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)) / 0.52, 0.6, 1.12);
          vec3 c = diffuseColor.rgb * uPiel;
          if (r == 1.0) c = uRemera * luz;
          else if (r == 2.0 || (r == 3.0 && uCorto < 0.5)) c = uPantalon * luz;
          else if (r == 4.0) c = uZapas * luz;
          diffuseColor.rgb = c;
        }`
      )
      .replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uRelleno;"
      );
  };
  // Todos comparten el mismo programa: sólo cambian los colores.
  mat.customProgramCacheKey = () => "odisea-cuerpo";
  return { mat, u };
}

interface Actor {
  raiz: THREE.Object3D;
  genero: 0 | 1;
  mezcla: THREE.AnimationMixer;
  acciones: Partial<Record<AccionGente, THREE.AnimationAction>>;
  u: ReturnType<typeof materialCuerpo>["u"];
  /** Uno por textura (cada peinado usa la suya); todos con el color de pelo de la persona. */
  matsPelo: THREE.MeshStandardMaterial[];
  pelos: Record<string, THREE.Mesh>;
  barba?: THREE.Mesh;
  de: Figurante | null;
}

export function crearGenteReal(escena: THREE.Scene, op: { movil: boolean; sombras: boolean; quietos: boolean }): GenteReal {
  const tope = op.movil ? 14 : 40;
  const actores: Actor[] = [];
  let liberado = false;
  /** Materiales de pelo, cejas y ojos: su luz propia se ajusta en `ponerRelleno`. */
  const otrosMats = new Set<THREE.MeshStandardMaterial>();
  let pendiente: Figurante[] | null = null;

  const cargador = new GLTFLoader();
  cargador.setMeshoptDecoder(MeshoptDecoder);
  const cargar = (f: string) => cargador.loadAsync(BASE + f);

  Promise.all([cargar("cuerpo-m.glb"), cargar("cuerpo-f.glb"), cargar("pelos.glb"), cargar("animaciones.glb")])
    .then(([m, f, p, a]) => {
      if (liberado) return;
      armar([m, f], p, a);
      // Los ojos llegan después de que el motor puso la hora.
      for (const mat of otrosMats) mat.emissive.copy(mat.color).multiplyScalar(relleno.value);
      if (pendiente) elegir(pendiente);
    })
    .catch((e) => {
      // Sin los archivos el mapa sigue con la gente de siempre.
      if (import.meta.env.DEV) console.warn("[croquis] no se pudo cargar la gente", e);
    });

  function armar(cuerpos: GLTF[], pelosGltf: GLTF, anims: GLTF) {
    const mallasPelo: Record<string, THREE.Mesh> = {};
    pelosGltf.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) mallasPelo[o.name] = o as THREE.Mesh;
    });

    cuerpos.forEach((gltf, genero) => {
      // La pelvis de cada cuerpo: las animaciones guardan su movimiento como
      // diferencia con el reposo, y se le suma el de este cuerpo.
      let pelvis = new THREE.Vector3();
      gltf.scene.traverse((o) => {
        if (o.name === "pelvis") pelvis = o.position.clone();
        if ((o as THREE.SkinnedMesh).isSkinnedMesh && /superhero/i.test(o.name)) marcarRopa(o as THREE.SkinnedMesh);
      });
      const clips = anims.animations.map((c) => {
        const copia = c.clone();
        for (const tr of copia.tracks) {
          if (tr.name !== "pelvis.position") continue;
          for (let i = 0; i < tr.values.length; i += 3) {
            tr.values[i] += pelvis.x;
            tr.values[i + 1] += pelvis.y;
            tr.values[i + 2] += pelvis.z;
          }
        }
        return copia;
      });

      const cant = Math.ceil(tope / 2);
      for (let k = 0; k < cant; k++) {
        const raiz = clonarConEsqueleto(gltf.scene);
        let cuerpo: THREE.SkinnedMesh | null = null;
        let cabeza: THREE.Object3D | null = null;
        const matsPelo = new Map<THREE.Texture | null, THREE.MeshStandardMaterial>();
        const matPelo = (mapa: THREE.Texture | null) => {
          let m = matsPelo.get(mapa);
          if (!m) {
            m = new THREE.MeshStandardMaterial({ map: mapa, emissiveMap: mapa, roughness: 0.85, metalness: 0 });
            matsPelo.set(mapa, m);
          }
          return m;
        };
        const { mat, u } = materialCuerpo(null);
        raiz.traverse((o) => {
          if (o.name === "Head") cabeza = o;
          const sm = o as THREE.SkinnedMesh;
          if (!sm.isSkinnedMesh) return;
          sm.castShadow = op.sombras;
          // El bind es de reposo: con los brazos arriba la caja quedaría corta y
          // el personaje desaparecería en los bordes de la pantalla.
          sm.frustumCulled = false;
          const orig = sm.material as THREE.MeshStandardMaterial;
          if (/superhero/i.test(sm.name)) {
            mat.map = orig.map;
            sm.material = mat;
            cuerpo = sm;
          } else if (/brow/i.test(sm.name) || /hair/i.test(orig.name)) {
            sm.material = matPelo(orig.map);
          } else {
            // Los ojos: un material compartido por todos.
            orig.emissiveMap = orig.map;
            otrosMats.add(orig);
          }
        });
        if (!cuerpo || !cabeza) continue;
        const pelos: Record<string, THREE.Mesh> = {};
        for (const nombre of new Set(PEINADOS[genero])) {
          const base = mallasPelo[nombre];
          if (!base) continue;
          const malla = new THREE.Mesh(base.geometry, matPelo((base.material as THREE.MeshStandardMaterial).map));
          // La compresión guarda la malla achicada y pone la escala en el nodo:
          // sin copiar su transformación, el pelo sale gigante.
          malla.position.copy(base.position);
          malla.quaternion.copy(base.quaternion);
          malla.scale.copy(base.scale);
          malla.castShadow = op.sombras;
          malla.visible = false;
          (cabeza as THREE.Object3D).add(malla);
          pelos[nombre] = malla;
        }
        let barba: THREE.Mesh | undefined;
        if (genero === 0 && mallasPelo.Hair_Beard) {
          barba = new THREE.Mesh(
            mallasPelo.Hair_Beard.geometry,
            matPelo((mallasPelo.Hair_Beard.material as THREE.MeshStandardMaterial).map)
          );
          barba.position.copy(mallasPelo.Hair_Beard.position);
          barba.quaternion.copy(mallasPelo.Hair_Beard.quaternion);
          barba.scale.copy(mallasPelo.Hair_Beard.scale);
          barba.visible = false;
          (cabeza as THREE.Object3D).add(barba);
        }
        const mezcla = new THREE.AnimationMixer(raiz);
        const acciones: Actor["acciones"] = {};
        for (const c of clips) acciones[c.name as AccionGente] = mezcla.clipAction(c);
        raiz.visible = false;
        escena.add(raiz);
        actores.push({ raiz, genero: genero as 0 | 1, mezcla, acciones, u, matsPelo: [...matsPelo.values()], pelos, barba, de: null });
      }
    });
  }

  /** Viste y ubica a un personaje como la persona `f`. */
  function vestir(a: Actor, f: Figurante) {
    a.de = f;
    f.real = true;
    a.raiz.position.set(f.x, f.y, f.z);
    a.raiz.rotation.y = f.giro;
    a.raiz.scale.setScalar(f.escala * 0.97);
    a.u.uRemera.value.copy(f.remera);
    a.u.uPantalon.value.copy(f.pantalon);
    a.u.uPiel.value.copy(f.piel);
    // Zapatillas blancas o negras, como en cualquier fiesta.
    a.u.uZapas.value.set(f.fase < 0.55 ? "#ececec" : "#1b1b1d");
    a.u.uCorto.value = f.corto ? 1 : 0;
    for (const m of a.matsPelo) {
      m.color.copy(f.pelo);
      m.emissive.copy(f.pelo).multiplyScalar(relleno.value);
    }
    const peinado = PEINADOS[a.genero][f.peinado % CANT_PEINADOS];
    for (const [n, m] of Object.entries(a.pelos)) m.visible = n === peinado;
    if (a.barba) a.barba.visible = f.barba;
    a.mezcla.stopAllAction();
    const acc = a.acciones[op.quietos ? "quieto" : f.accion] ?? a.acciones.quieto;
    if (acc) {
      acc.reset();
      acc.time = f.fase * acc.getClip().duration;
      acc.timeScale = op.quietos ? 0 : 0.92 + f.fase * 0.16;
      acc.play();
    }
    a.mezcla.update(0);
    a.raiz.visible = true;
  }

  function soltar(a: Actor) {
    if (a.de) a.de.real = false;
    a.de = null;
    a.raiz.visible = false;
    a.mezcla.stopAllAction();
  }

  function elegir(cercanas: Figurante[]) {
    if (!actores.length) {
      pendiente = cercanas;
      return;
    }
    pendiente = null;
    // Las que corresponde dibujar con personaje: las más cercanas de cada
    // género, hasta lo que hay de cada uno.
    const cupo: [number, number] = [0, 0];
    for (const a of actores) cupo[a.genero]++;
    const quiero = new Set<Figurante>();
    for (const f of cercanas) {
      if (cupo[f.genero] <= 0) continue;
      cupo[f.genero]--;
      quiero.add(f);
    }
    const libres: [Actor[], Actor[]] = [[], []];
    for (const a of actores) {
      if (a.de && quiero.has(a.de)) quiero.delete(a.de);
      else {
        soltar(a);
        libres[a.genero].push(a);
      }
    }
    for (const f of quiero) {
      const a = libres[f.genero].pop();
      if (a) vestir(a, f);
    }
  }

  return {
    tope,
    elegir,
    ponerRelleno(valor) {
      relleno.value = valor;
      for (const m of otrosMats) m.emissive.copy(m.color).multiplyScalar(valor);
      for (const a of actores) for (const m of a.matsPelo) m.emissive.copy(m.color).multiplyScalar(valor);
    },
    actualizar(dt) {
      if (op.quietos) return;
      for (const a of actores) if (a.de) a.mezcla.update(dt);
    },
    liberar() {
      liberado = true;
      for (const a of actores) a.mezcla.stopAllAction();
    },
  };
}
