import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Hora } from "./tipos";

/**
 * Lo que hace que el croquis se vea "de verdad" sin bajar archivos:
 *
 * - **Luz de ambiente con reflejos** (`RoomEnvironment` → PMREM, una vez al
 *   abrir el mapa). Sin esto los materiales sólo veían la luz del cielo y el sol:
 *   la ropa, la piel, el metal del truss y la pantalla quedaban planos. Va en el
 *   celular también: es un mapa que se arma una vez y casi no cuesta por cuadro.
 * - **Brillo de las luces (bloom)**, sólo en escritorio: las pantallas, las
 *   lamparitas, los haces y las lonas iluminadas se "encienden" de noche. Es
 *   una pasada de más por cuadro (a media resolución): en un celular de gama
 *   media es la diferencia entre fluido y trabado, por eso no va ahí.
 *
 * El umbral del brillo sube de día: con el cielo claro, todo lo blanco
 * brillaría.
 */

export interface Postproceso {
  /** El cielo de foto de la hora (o null: la luz de ambiente genérica). */
  ponerCielo(cielo: THREE.Texture | null): void;
  dibujar(): void;
  ajustar(w: number, h: number, pixelRatio: number): void;
  ponerHora(hora: Hora): void;
  liberar(): void;
}

export function crearPostproceso(
  renderer: THREE.WebGLRenderer,
  escena: THREE.Scene,
  camara: THREE.PerspectiveCamera,
  op: { movil: boolean }
): Postproceso {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const ambiente = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  escena.environment = ambiente;
  // Con el cielo de foto, la luz de ambiente sale de él (tiñe todo del color de la
  // hora). Se arma una vez por cielo.
  const deCielo = new Map<THREE.Texture, THREE.Texture>();
  let conFoto = false;
  let horaActual: Hora = "noche";
  // La que sale de la foto del cielo es más tenue que la genérica (un cielo LDR,
  // sin el sol "de verdad"): por eso dos tablas.
  const aplicarIntensidad = () => {
    escena.environmentIntensity = (conFoto ? { dia: 1.1, atardecer: 0.7, noche: 0.3 } : { dia: 0.45, atardecer: 0.2, noche: 0.05 })[horaActual];
  };

  let composer: EffectComposer | null = null;
  let brillo: UnrealBloomPass | null = null;
  if (!op.movil) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(escena, camara));
    brillo = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.5, 0.82);
    composer.addPass(brillo);
    composer.addPass(new OutputPass());
  }

  return {
    ponerCielo(cielo) {
      conFoto = !!cielo;
      aplicarIntensidad();
      if (!cielo) {
        escena.environment = ambiente;
        return;
      }
      let env = deCielo.get(cielo);
      if (!env) {
        env = pmrem.fromEquirectangular(cielo).texture;
        deCielo.set(cielo, env);
      }
      escena.environment = env;
    },
    dibujar() {
      if (composer) composer.render();
      else renderer.render(escena, camara);
    },
    ajustar(w, h, pixelRatio) {
      if (!composer || !brillo) return;
      composer.setPixelRatio(pixelRatio);
      composer.setSize(w, h);
      // El brillo a media resolución: se ve igual y cuesta la cuarta parte.
      brillo.resolution.set(w / 2, h / 2);
    },
    ponerHora(hora) {
      // Cuánto aporta la luz de ambiente: de día mucho, de noche poco (si no, la
      // noche se ve gris).
      horaActual = hora;
      aplicarIntensidad();
      if (brillo) {
        brillo.strength = { dia: 0.1, atardecer: 0.35, noche: 0.55 }[hora];
        brillo.threshold = { dia: 0.98, atardecer: 0.95, noche: 0.9 }[hora];
        brillo.radius = 0.35;
      }
    },
    liberar() {
      ambiente.dispose();
      for (const t of deCielo.values()) t.dispose();
      pmrem.dispose();
      composer?.dispose();
    },
  };
}
