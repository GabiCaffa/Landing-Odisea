import * as THREE from "three";
import { crearCigarro, crearVasoOdisea, texturaHumo } from "./accesorios";
import { acomodarEnMano } from "./gente";
import { buscar, clonar, type NombreAnim, type Plantilla } from "./modelos";

/**
 * El personaje que maneja la persona al caminar por el croquis: un personaje
 * de Mixamo con el vaso de ODÍSEA en la mano, que camina, corre, baila, toma y
 * fuma con animaciones de cuerpo entero.
 *
 * - **Tercera persona**: la cámara va atrás, sobre el hombro, y se ve entero.
 * - **Primera persona**: la cámara va en los ojos del personaje. La cabeza se
 *   achica a nada (si no, se vería por dentro); el resto del cuerpo se ve al
 *   mirar para abajo, y las manos al tomar o fumar.
 *
 * El motor decide dónde está y hacia dónde mira; acá se elige la animación
 * según la velocidad, y las acciones (bailar, tomar, fumar) se cortan al
 * moverse.
 */

export type AccionJugador = "bailar" | "tomar" | "fumar";

export interface EstadoJugador {
  x: number;
  y: number;
  z: number;
  /** Hacia dónde mira la cámara (radianes; 0 = +z). */
  yaw: number;
  /** Velocidad en el piso, m/s, y su dirección. */
  vx: number;
  vz: number;
  primera: boolean;
}

export interface Jugador {
  raiz: THREE.Object3D;
  actualizar(dt: number, e: EstadoJugador): void;
  /** Empieza una acción (o la corta con null). Bailar otra vez cambia de baile. */
  hacer(accion: AccionJugador | null): void;
  accion(): AccionJugador | null;
  /** Dónde van los ojos (para la cámara en primera persona). */
  ojos(out: THREE.Vector3): THREE.Vector3;
  /** La altura de la cabeza, para apuntar la cámara en tercera persona. */
  cabeza(out: THREE.Vector3): THREE.Vector3;
  ponerRelleno(valor: number): void;
  liberar(): void;
}

const BAILES: NombreAnim[] = ["bailar1", "bailar2", "bailar3", "bailar4"];
const VEL_CAMINAR = 1.5; // m/s a la que la animación de caminar no patina
const VEL_CORRER = 4.6;

export function crearJugador(
  escena: THREE.Scene,
  p: Plantilla,
  op: { quietos: boolean; alTerminar?: (a: AccionJugador) => void }
): Jugador {
  const raiz = clonar(p);
  raiz.visible = false;
  escena.add(raiz);
  const mezcla = new THREE.AnimationMixer(raiz);
  const accionDe = (n: NombreAnim) => {
    const c = p.clips.get(n);
    return c ? mezcla.clipAction(c) : null;
  };

  const cabezaHueso = buscar(raiz, "mixamorigHead");
  const manoDer = buscar(raiz, "mixamorigRightHand");
  const manoIzq = buscar(raiz, "mixamorigLeftHand");

  // Las animaciones de Mixamo toman con la izquierda y fuman con la derecha:
  // el vaso va en la izquierda, siempre, y el cigarro en la derecha al fumar.
  const vaso = crearVasoOdisea();
  if (manoIzq) acomodarEnMano(vaso, manoIzq);
  const cigarro = crearCigarro();
  cigarro.grupo.visible = false;
  if (manoDer)
    acomodarEnMano(cigarro.grupo, manoDer, (o) => {
      // Entre el índice y el mayor, la brasa hacia afuera.
      o.position.multiplyScalar(1.15);
      o.rotation.set(0, 0, Math.PI / 2);
    });

  // El humo: nubes que salen de la brasa al fumar y suben despacio.
  const humo: { s: THREE.Sprite; vida: number }[] = [];
  const matHumo = new THREE.SpriteMaterial({ map: texturaHumo(), transparent: true, depthWrite: false, opacity: 0 });
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(matHumo.clone());
    s.visible = false;
    escena.add(s);
    humo.push({ s, vida: 0 });
  }
  let proximoHumo = 0;
  const punta = new THREE.Vector3();

  let base: THREE.AnimationAction | null = null;
  let actual: THREE.AnimationAction | null = null;
  let accion: AccionJugador | null = null;
  let baile = 0;
  let cuerpoYaw = 0;
  let primera = false;
  const fundir = (a: THREE.AnimationAction | null, s = 0.3) => {
    if (!a || a === actual) return;
    a.reset();
    a.enabled = true;
    a.setEffectiveWeight(1);
    a.play();
    if (actual) a.crossFadeFrom(actual, s, false);
    actual = a;
  };

  const terminarAccion = () => {
    const era = accion;
    accion = null;
    cigarro.grupo.visible = false;
    base = null; // que la base se elija de nuevo
    if (era) op.alTerminar?.(era);
  };
  mezcla.addEventListener("finished", (e) => {
    if ((e as unknown as { action: THREE.AnimationAction }).action === actual && accion && accion !== "bailar") terminarAccion();
  });

  const hacer = (a: AccionJugador | null) => {
    if (a === null) {
      if (accion) terminarAccion();
      return;
    }
    if (op.quietos) return;
    let nombre: NombreAnim;
    if (a === "bailar") {
      nombre = BAILES[baile++ % BAILES.length];
    } else nombre = a;
    const acc = accionDe(nombre);
    if (!acc) return;
    acc.setLoop(a === "bailar" ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    acc.clampWhenFinished = a !== "bailar";
    acc.timeScale = 1;
    accion = a;
    cigarro.grupo.visible = a === "fumar";
    fundir(acc, 0.35);
  };

  const v = new THREE.Vector3();
  return {
    raiz,
    hacer,
    accion: () => accion,
    actualizar(dt, e) {
      raiz.visible = true;
      raiz.position.set(e.x, e.y, e.z);
      const velocidad = Math.hypot(e.vx, e.vz);
      // Moverse corta lo que se esté haciendo.
      if (accion && velocidad > 0.35) terminarAccion();
      // Hacia dónde mira el cuerpo: en primera persona, adonde se mira; en
      // tercera, hacia donde camina (y quieto, queda como estaba).
      // Al aparecer, de espaldas a la cámara (mirando adonde mira ella).
      if (!raiz.userData.ubicado) {
        raiz.userData.ubicado = true;
        cuerpoYaw = e.yaw;
      }
      let objetivo = cuerpoYaw;
      if (e.primera) objetivo = e.yaw;
      else if (velocidad > 0.3) objetivo = Math.atan2(e.vx, e.vz);
      let d = objetivo - cuerpoYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      cuerpoYaw += e.primera ? d : d * Math.min(1, dt * 10);
      raiz.rotation.y = cuerpoYaw;

      if (!accion) {
        const quiero = velocidad < 0.3 ? "quieto" : velocidad < 3.2 ? "caminar" : "correr";
        const acc = accionDe(quiero);
        if (acc && acc !== base) {
          acc.setLoop(THREE.LoopRepeat, Infinity);
          base = acc;
          fundir(acc, 0.25);
        }
        if (acc && quiero === "caminar") acc.timeScale = THREE.MathUtils.clamp(velocidad / VEL_CAMINAR, 0.6, 1.9);
        if (acc && quiero === "correr") acc.timeScale = THREE.MathUtils.clamp(velocidad / VEL_CORRER, 0.8, 1.5);
      }
      if (!op.quietos || !actual) mezcla.update(op.quietos ? 0 : dt);
      // Los ojos y el humo se leen en este mismo cuadro: los huesos, al día.
      raiz.updateMatrixWorld(true);

      // Primera persona: sin cabeza (la cámara está adentro).
      if (e.primera !== primera) {
        primera = e.primera;
        cabezaHueso?.scale.setScalar(primera ? 0.001 : 1);
      }

      // Humo al fumar: una nube cada tanto desde la brasa.
      const fumando = accion === "fumar" && cigarro.grupo.visible;
      cigarro.brasa.emissiveIntensity = fumando ? 1.2 + Math.sin(performance.now() / 120) * 0.4 : 0.6;
      if (fumando && (proximoHumo -= dt) <= 0) {
        proximoHumo = 0.35;
        const libre = humo.find((h) => h.vida <= 0);
        if (libre) {
          cigarro.punta.getWorldPosition(punta);
          libre.vida = 2.4;
          libre.s.position.copy(punta);
          libre.s.scale.setScalar(0.05);
          libre.s.visible = true;
        }
      }
      for (const h of humo) {
        if (h.vida <= 0) continue;
        h.vida -= dt;
        const k = 1 - h.vida / 2.4;
        h.s.position.y += dt * 0.22;
        h.s.position.x += dt * 0.05;
        h.s.scale.setScalar(0.05 + k * 0.35);
        (h.s.material as THREE.SpriteMaterial).opacity = Math.sin(Math.PI * Math.min(1, k * 1.4)) * 0.45;
        if (h.vida <= 0) h.s.visible = false;
      }
    },
    ojos(out) {
      if (!cabezaHueso) return out.set(raiz.position.x, raiz.position.y + 1.62, raiz.position.z);
      cabezaHueso.getWorldPosition(out);
      // De la base del cráneo a los ojos: arriba y adelante.
      v.set(Math.sin(cuerpoYaw), 0, Math.cos(cuerpoYaw));
      return out.addScaledVector(v, 0.11).add(v.set(0, 0.07, 0));
    },
    cabeza(out) {
      if (!cabezaHueso) return out.set(raiz.position.x, raiz.position.y + 1.6, raiz.position.z);
      return cabezaHueso.getWorldPosition(out);
    },
    ponerRelleno(valor) {
      for (const m of p.materiales) m.emissive.setScalar(valor);
    },
    liberar() {
      mezcla.stopAllAction();
    },
  };
}
