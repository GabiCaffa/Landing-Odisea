import * as THREE from "three";
import { crearVasoOdisea } from "./accesorios";
import { buscar, clonar, type NombreAnim, type Plantilla } from "./modelos";

/**
 * La gente "de verdad" del croquis: personajes de Mixamo con ropa, cara y
 * animaciones (bailar, charlar, tomar algo, quedarse quieto).
 *
 * Cómo se reparte con la gente de siempre:
 * - **La multitud sigue siendo la malla instanciada del motor**: cientos de
 *   personas en pocas llamadas de dibujo. Un personaje animado cuesta varias
 *   llamadas (una por prenda) y su esqueleto se calcula en cada cuadro, así que
 *   no puede haber cientos.
 * - **Las más cercanas a la cámara, en cuadro, se cambian por personajes** (40
 *   en escritorio, 14 en el celular). El motor elige cuáles cada un cuarto de
 *   segundo; acá se reparte un grupo fijo de personajes entre ellas y la
 *   persona instanciada de ese lugar se esconde.
 * - **Cada persona tiene su modelo** (`modelo`, de 0 a 7): así se ve igual cada
 *   vez que le toca un personaje. Hay 5 personajes por modelo; si se piden más
 *   de un mismo modelo, los que sobran siguen instanciados.
 * - Si los archivos no llegan, el mapa sigue con la gente de siempre.
 */

export type AccionGente = "bailar" | "quieto" | "charlar" | "tomar";

/** Lo que el motor sabe de cada persona de la multitud. */
export interface Figurante {
  x: number;
  y: number;
  z: number;
  giro: number;
  escala: number;
  /** Qué personaje es (0..7). */
  modelo: number;
  accion: AccionGente;
  /** 0..1: qué baile le toca y en qué punto de la animación arranca. */
  fase: number;
  /** Lo pone este módulo: la persona está dibujada con un personaje. */
  real?: boolean;
}

export interface GenteReal {
  /** Cuántos personajes hay como máximo. */
  readonly tope: number;
  /** `cercanas`: las personas en cuadro más cerca de la cámara, la más cercana primero. */
  elegir(cercanas: Figurante[]): void;
  actualizar(dt: number): void;
  /** Luz propia de 0 a 1: de noche el predio está oscuro salvo los focos. */
  ponerRelleno(valor: number): void;
  liberar(): void;
}

interface Actor {
  raiz: THREE.Object3D;
  modelo: number;
  mezcla: THREE.AnimationMixer;
  clips: Map<NombreAnim, THREE.AnimationClip>;
  vaso: THREE.Object3D | null;
  de: Figurante | null;
}

const BAILES: NombreAnim[] = ["bailar1", "bailar2", "bailar3", "bailar4"];
const POR_MODELO = 5;

export function crearGenteReal(
  escena: THREE.Scene,
  plantillas: Promise<Plantilla>[],
  op: { movil: boolean; quietos: boolean }
): GenteReal {
  const tope = op.movil ? 14 : 40;
  const actores: Actor[] = [];
  const materiales = new Set<THREE.MeshStandardMaterial>();
  let relleno = 0;
  let liberado = false;
  let ultimas: Figurante[] = [];
  const cargadas: number[] = [];
  const porModelo = Math.max(POR_MODELO, Math.ceil(tope / plantillas.length));

  plantillas.forEach((pr, modelo) =>
    pr
      .then((p) => {
        if (liberado) return;
        for (const m of p.materiales) {
          materiales.add(m);
          m.emissive.setScalar(relleno);
        }
        for (let k = 0; k < porModelo && actores.length < tope + POR_MODELO; k++) {
          const raiz = clonar(p);
          raiz.visible = false;
          // El vaso en la mano izquierda (la que usa la animación de tomar).
          const mano = buscar(raiz, "mixamorigLeftHand");
          let vaso: THREE.Object3D | null = null;
          if (mano) {
            vaso = crearVasoOdisea();
            acomodarEnMano(vaso, mano);
            vaso.visible = false;
          }
          escena.add(raiz);
          actores.push({ raiz, modelo, mezcla: new THREE.AnimationMixer(raiz), clips: p.clips, vaso, de: null });
        }
        cargadas.push(modelo);
        elegir(ultimas);
      })
      .catch((e) => {
        if (import.meta.env.DEV) console.warn("[croquis] no se pudo cargar una persona", e);
      })
  );

  /** El modelo que dibuja a esta persona entre los que ya llegaron. */
  const modeloDe = (f: Figurante) => (cargadas.includes(f.modelo) ? f.modelo : cargadas[f.modelo % cargadas.length]);

  function vestir(a: Actor, f: Figurante) {
    a.de = f;
    f.real = true;
    a.raiz.position.set(f.x, f.y, f.z);
    a.raiz.rotation.y = f.giro;
    a.raiz.scale.setScalar(f.escala);
    if (a.vaso) a.vaso.visible = f.accion === "tomar" || f.accion === "charlar";
    a.mezcla.stopAllAction();
    const nombre: NombreAnim = op.quietos
      ? "quieto"
      : f.accion === "bailar"
        ? BAILES[Math.floor(f.fase * BAILES.length) % BAILES.length]
        : f.accion === "charlar"
          ? "charlar"
          : f.accion === "tomar"
            ? "tomar"
            : "quieto";
    const clip = a.clips.get(nombre) ?? a.clips.get("quieto");
    if (clip) {
      const acc = a.mezcla.clipAction(clip);
      acc.reset();
      acc.time = ((f.fase * 7.3) % 1) * clip.duration;
      acc.timeScale = op.quietos ? 0 : 0.94 + ((f.fase * 13) % 1) * 0.12;
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
    ultimas = cercanas;
    if (!actores.length) return;
    // Lo que entra: las más cercanas, mientras haya personajes libres de su modelo.
    const libresPor = new Map<number, number>();
    for (const a of actores) libresPor.set(a.modelo, (libresPor.get(a.modelo) ?? 0) + 1);
    const quiero = new Set<Figurante>();
    let total = 0;
    for (const f of cercanas) {
      if (total >= tope) break;
      const m = modeloDe(f);
      const libres = libresPor.get(m) ?? 0;
      if (libres <= 0) continue;
      libresPor.set(m, libres - 1);
      quiero.add(f);
      total++;
    }
    const libres: Actor[] = [];
    for (const a of actores) {
      if (a.de && quiero.has(a.de) && a.modelo === modeloDe(a.de)) quiero.delete(a.de);
      else {
        soltar(a);
        libres.push(a);
      }
    }
    for (const f of quiero) {
      const m = modeloDe(f);
      const i = libres.findIndex((a) => a.modelo === m);
      if (i >= 0) vestir(libres.splice(i, 1)[0], f);
    }
  }

  return {
    tope,
    elegir,
    actualizar(dt) {
      if (op.quietos) return;
      for (const a of actores) if (a.de) a.mezcla.update(dt);
    },
    ponerRelleno(valor) {
      relleno = valor;
      for (const m of materiales) m.emissive.setScalar(valor);
    },
    liberar() {
      liberado = true;
      for (const a of actores) a.mezcla.stopAllAction();
    },
  };
}

/**
 * Pone un objeto en la palma de una mano de un personaje de Mixamo. La
 * mano viene escalada (el modelo está en centímetros): se compensa para que el
 * objeto quede de su tamaño real en metros.
 */
export function acomodarEnMano(obj: THREE.Object3D, mano: THREE.Object3D, ajuste?: (o: THREE.Object3D) => void) {
  mano.updateWorldMatrix(true, false);
  const escala = new THREE.Vector3();
  mano.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), escala);
  const s = 1 / (escala.x || 1);
  obj.scale.setScalar(s);
  // En el hueso de la mano de Mixamo, +y va hacia los dedos y +z hacia afuera
  // de la palma (lado del pulgar adelante en pose en T).
  obj.position.set(0, 0.075 * s, 0.045 * s);
  ajuste?.(obj);
  mano.add(obj);
}
