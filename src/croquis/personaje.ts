import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/**
 * Lo que se ve de uno mismo al caminar por el croquis en primera persona: la
 * mano derecha con un vaso de ODÍSEA, abajo a la derecha de la pantalla, como
 * en los juegos. Va colgado de la cámara (el motor lo agrega como hijo), así
 * que sigue la mirada solo.
 *
 * Hecho con la misma regla que el resto del croquis —cajas, esferas y
 * cilindros, sin modelos que bajar— y con un diseño propio: manga de buzo
 * negro con puño naranja, y el vaso negro con el logo blanco, hielo y un
 * sorbete naranja.
 *
 * Coordenadas en el espacio de la cámara: -z es hacia adelante, +x a la
 * derecha, +y arriba.
 */

const NARANJA = "#F25C26";

/** El vaso: negro, bordes naranjas y el logo blanco dos veces (adelante y atrás). */
export function texturaVaso(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 320;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#111114";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = NARANJA;
  ctx.fillRect(0, 0, c.width, 40);
  ctx.fillRect(0, c.height - 14, c.width, 14);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  // El logo del sitio (blanco sobre transparente, 500×500 con la palabra en la
  // franja del medio). Si no carga, el vaso queda negro con los bordes.
  const img = new Image();
  img.onload = () => {
    const [sx, sy, sw, sh] = [80, 185, 345, 115];
    const ancho = 300;
    const alto = (ancho * sh) / sw;
    for (const cx of [c.width * 0.25, c.width * 0.75]) {
      ctx.drawImage(img, sx, sy, sw, sh, cx - ancho / 2, 165 - alto / 2 + 14, ancho, alto);
    }
    tex.needsUpdate = true;
  };
  img.src = "/email-logo-white.png";
  return tex;
}

export interface ManoConVaso {
  grupo: THREE.Group;
  /**
   * La otra mano, con el cigarro. Entra desde abajo a la izquierda al fumar y
   * vuelve a esconderse. El motor la ubica según la pantalla, como al vaso.
   */
  izquierda: THREE.Group;
  /** El humo, delante de la cara (espacio de la cámara). */
  humo: THREE.Group;
  /** `paso` 0 = quieto, 1 = caminando, ~1,8 = corriendo. `dt` en segundos. */
  animar(t: number, paso: number, dt?: number): void;
  /** Arranca una pitada (unos 5 s). Si ya se está fumando, no hace nada. */
  fumar(): void;
  /** ¿Está fumando ahora? */
  fumando(): boolean;
  /** Bailando, el vaso sube y baja al ritmo. */
  bailar(activo: boolean): void;
}

/** Una nube suave para el humo: un círculo blanco que se desvanece hacia el borde. */
function texturaHumo(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(242,242,246,1)");
  g.addColorStop(0.45, "rgba(220,220,228,0.8)");
  g.addColorStop(1, "rgba(210,210,220,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** 0 → 1 suave. */
const suavizar = (x: number) => {
  const k = Math.min(1, Math.max(0, x));
  return k * k * (3 - 2 * k);
};

export function crearManoConVaso(): ManoConVaso {
  const mat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
  const piel = mat("#e7b48e", { roughness: 0.6 });
  const buzo = mat("#17171b", { roughness: 0.9 });
  const naranja = mat(NARANJA, { emissive: NARANJA, emissiveIntensity: 0.2 });

  const grupo = new THREE.Group();
  // Todo lo de la mano va adentro de `brazo`, que es lo que se balancea.
  const brazo = new THREE.Group();
  grupo.add(brazo);

  // El vaso.
  const vaso = new THREE.Group();
  const alto = 0.15;
  const lado = new THREE.Mesh(
    new THREE.CylinderGeometry(0.052, 0.04, alto, 32, 1, true),
    new THREE.MeshStandardMaterial({ map: texturaVaso(), roughness: 0.35, side: THREE.DoubleSide })
  );
  // El cilindro arranca su textura mirando al costado: girado, un logo queda
  // mirando a la cámara.
  lado.rotation.y = Math.PI / 2;
  vaso.add(lado);
  const fondo = new THREE.Mesh(new THREE.CircleGeometry(0.04, 24), mat("#111114"));
  fondo.rotation.x = Math.PI / 2;
  fondo.position.y = -alto / 2;
  vaso.add(fondo);
  const bebida = new THREE.Mesh(
    new THREE.CircleGeometry(0.049, 24),
    mat("#f2a93b", { emissive: "#f2a93b", emissiveIntensity: 0.25, roughness: 0.15, metalness: 0.1 })
  );
  bebida.rotation.x = -Math.PI / 2;
  bebida.position.y = alto / 2 - 0.018;
  vaso.add(bebida);
  const hielo = mat("#eaf6ff", { transparent: true, opacity: 0.85, roughness: 0.1 });
  [
    [0.016, 0.012, 0.3],
    [-0.015, -0.01, 1.1],
    [0.0, -0.022, 2.0],
  ].forEach(([x, z, r]) => {
    const cubo = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.018, 0.022), hielo);
    cubo.position.set(x, alto / 2 - 0.012, z);
    cubo.rotation.y = r;
    vaso.add(cubo);
  });
  const borde = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.004, 6, 32), mat("#f4f4f4"));
  borde.rotation.x = Math.PI / 2;
  borde.position.y = alto / 2;
  vaso.add(borde);
  const sorbete = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.2, 8), naranja);
  sorbete.position.set(-0.018, alto / 2 + 0.03, 0.005);
  sorbete.rotation.z = 0.25;
  vaso.add(sorbete);
  brazo.add(vaso);

  // La mano derecha agarrando el vaso, vista desde los ojos: el dorso del lado
  // de afuera (a la derecha del vaso), el pulgar cruzando por adelante arriba y
  // los otros cuatro dedos por detrás, que casi no se ven. De ahí baja la
  // muñeca a la manga. Formas redondeadas: con bloques parecía de juguete.
  const mano = new THREE.Group();
  const dorso = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.088, 0.09, 4, 0.013), piel);
  dorso.position.set(0.064, -0.004, -0.004);
  dorso.rotation.z = 0.1;
  mano.add(dorso);
  // Un dedo de dos falanges, que rodea el vaso a la altura y.
  const dedo = (y: number, atras: boolean, largo: number) => {
    const g = new THREE.Group();
    const r = 0.0105;
    const a = new THREE.Mesh(new THREE.CapsuleGeometry(r, largo, 4, 10), piel);
    a.rotation.z = Math.PI / 2;
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.92, largo * 0.8, 4, 10), piel);
    b.rotation.z = Math.PI / 2;
    // Primera falange pegada al vaso; la segunda dobla siguiendo la curva.
    const g1 = new THREE.Group();
    g1.add(a);
    g1.position.set(0.045, y, atras ? -0.036 : 0.036);
    g1.rotation.y = atras ? -0.75 : 0.75;
    const g2 = new THREE.Group();
    g2.add(b);
    g2.position.set(0.012, y, atras ? -0.056 : 0.056);
    g2.rotation.y = atras ? -0.2 : 0.2;
    g.add(g1, g2);
    return g;
  };
  [0.03, 0.008, -0.014, -0.036].forEach((y, i) => mano.add(dedo(y, true, i === 3 ? 0.024 : 0.03)));
  // El pulgar, por adelante y arriba, apenas inclinado.
  const pulgar = dedo(0.03, false, 0.032);
  pulgar.scale.setScalar(0.85);
  pulgar.position.set(0.012, 0.012, 0);
  mano.add(pulgar);
  // Muñeca y antebrazo: bajan hacia la esquina, hacia los ojos.
  const haciaAbajo = new THREE.Vector3(0.38, -0.62, 0.69).normalize();
  const alinear = (m: THREE.Object3D) => m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), haciaAbajo);
  const munecaPos = new THREE.Vector3(0.07, -0.05, 0.008);
  const muneca = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.033, 0.07, 16), piel);
  alinear(muneca);
  muneca.position.copy(munecaPos).addScaledVector(haciaAbajo, 0.02);
  mano.add(muneca);
  const puno = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.045, 18), naranja);
  alinear(puno);
  puno.position.copy(munecaPos).addScaledVector(haciaAbajo, 0.065);
  mano.add(puno);
  const manga = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.058, 0.36, 18), buzo);
  alinear(manga);
  manga.position.copy(munecaPos).addScaledVector(haciaAbajo, 0.26);
  mano.add(manga);
  brazo.add(mano);

  // Abajo a la derecha, un poco girado hacia el centro.
  grupo.position.set(0.24, -0.27, -0.5);
  grupo.rotation.set(0.05, -0.35, 0);

  // ── La otra mano, con el cigarro ──
  // Arranca escondida abajo; `mano2` es lo que viaja hasta la boca y vuelve.
  const izquierda = new THREE.Group();
  const mano2 = new THREE.Group();
  izquierda.add(mano2);
  // La manga sale hacia abajo y afuera del cuadro: si apuntara a la cámara,
  // pegada a los ojos se veía como un tronco negro cruzando la pantalla.
  const manga2 = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.26, 14), buzo);
  manga2.rotation.set(-0.5, 0, 0.55);
  manga2.position.set(-0.07, -0.14, 0.02);
  mano2.add(manga2);
  const puno2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 14), naranja);
  puno2.rotation.copy(manga2.rotation);
  puno2.position.set(-0.02, -0.045, -0.005);
  mano2.add(puno2);
  const palma2 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.065, 0.028), piel);
  palma2.position.set(0, 0, -0.02);
  palma2.rotation.z = -0.2;
  mano2.add(palma2);
  // Índice y mayor estirados hacia arriba, con el cigarro entre las puntas.
  for (const dx of [0.004, 0.026]) {
    const dedo = new THREE.Mesh(new THREE.CapsuleGeometry(0.0095, 0.05, 3, 8), piel);
    dedo.position.set(dx, 0.052, -0.024);
    dedo.rotation.z = -0.25;
    mano2.add(dedo);
  }
  const pulgar2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.04, 3, 8), piel);
  pulgar2.position.set(-0.035, 0.015, -0.02);
  pulgar2.rotation.z = 0.7;
  mano2.add(pulgar2);
  const cigarro = new THREE.Group();
  const papel = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.085, 10), mat("#f5f1e8", { roughness: 0.8 }));
  cigarro.add(papel);
  const filtro = new THREE.Mesh(new THREE.CylinderGeometry(0.0058, 0.0058, 0.025, 10), mat("#d8902f", { roughness: 0.8 }));
  filtro.position.y = -0.055;
  cigarro.add(filtro);
  const brasa = new THREE.MeshStandardMaterial({ color: "#ff5a1f", emissive: "#ff4410", emissiveIntensity: 0.6 });
  const punta = new THREE.Mesh(new THREE.CylinderGeometry(0.0056, 0.0056, 0.01, 10), brasa);
  punta.position.y = 0.047;
  cigarro.add(punta);
  // Atravesado entre las puntas de los dedos: la brasa hacia afuera (derecha,
  // un poco hacia arriba) y el filtro del lado de la mano.
  cigarro.rotation.z = -Math.PI / 2 + 0.35;
  cigarro.position.set(0.045, 0.085, -0.03);
  mano2.add(cigarro);
  mano2.visible = false;

  // ── El humo ──
  const humo = new THREE.Group();
  const texHumo = texturaHumo();
  const bocanadas = Array.from({ length: 9 }, (_, i) => {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texHumo, transparent: true, opacity: 0, depthWrite: false, depthTest: false })
    );
    s.userData = { retraso: i * 0.12, lado: (i % 2 ? 1 : -1) * (0.02 + (i % 3) * 0.015) };
    humo.add(s);
    return s;
  });
  humo.position.set(0, -0.06, -0.45);

  // Línea de tiempo de una pitada, en segundos.
  const SUBE = 0.7; // la mano viaja a la boca
  const PITA = 1.6; // fin de la pitada (la brasa se aviva)
  const BAJA = 2.3; // la mano vuelve un poco hacia abajo
  const SUELTA = 2.4; // empieza a salir el humo
  const FIN = 5.6;
  let reloj = -1; // -1 = no está fumando
  let bailando = false;
  const baja = new THREE.Vector3(-0.02, -0.32, 0.05); // fuera de cuadro
  const boca = new THREE.Vector3(0.12, 0.12, -0.04); // relativo a `izquierda`, frente a la boca
  const reposo = new THREE.Vector3(0.02, 0.02, 0); // bajada, a la vista

  const animar = (t: number, paso: number, dt = 0) => {
    const p = Math.min(paso, 2);
    const fase = t * (5.5 + p * 2.5);
    if (bailando) {
      // Brindando al ritmo (~124 bpm): el vaso arriba y abajo, con un vaivén.
      const golpe = Math.abs(Math.sin(t * 6.5));
      brazo.position.set(Math.sin(t * 3.25) * 0.02, 0.03 + golpe * 0.05, 0);
      brazo.rotation.z = Math.sin(t * 3.25) * 0.12;
    } else {
      // Al caminar se mece; quieto, apenas respira.
      const amp = 0.012 * Math.min(p, 1.6);
      brazo.position.x = Math.sin(fase * 0.5) * amp;
      brazo.position.y = p > 0.05 ? -Math.abs(Math.sin(fase)) * amp * 1.2 : Math.sin(t * 1.8) * 0.003;
      brazo.rotation.z = Math.sin(fase * 0.5) * amp * 1.5;
    }

    if (reloj < 0) return;
    reloj += dt;
    const r = reloj;
    mano2.visible = true;
    if (r < SUBE) mano2.position.lerpVectors(baja, boca, suavizar(r / SUBE));
    else if (r < PITA) mano2.position.copy(boca);
    else if (r < BAJA) mano2.position.lerpVectors(boca, reposo, suavizar((r - PITA) / (BAJA - PITA)));
    else if (r < FIN - 0.6) mano2.position.copy(reposo);
    else mano2.position.lerpVectors(reposo, baja, suavizar((r - (FIN - 0.6)) / 0.6));
    // La brasa se aviva al pitar.
    brasa.emissiveIntensity = r > SUBE && r < PITA ? 2.4 + Math.sin(r * 20) * 0.3 : 0.6;
    // Humo: cada bocanada sale, sube, crece y se desvanece.
    for (const b of bocanadas) {
      const k = (r - SUELTA - (b.userData.retraso as number)) / 2.4;
      const mat = b.material as THREE.SpriteMaterial;
      if (k <= 0 || k >= 1) {
        mat.opacity = 0;
        continue;
      }
      b.position.set((b.userData.lado as number) * (1 + k * 3), k * 0.26, -k * 0.3);
      b.scale.setScalar(0.06 + k * 0.26);
      mat.opacity = Math.sin(Math.min(1, k * 2) * Math.PI * 0.5) * (1 - k * k);
    }
    if (r >= FIN) {
      reloj = -1;
      mano2.visible = false;
      for (const b of bocanadas) (b.material as THREE.SpriteMaterial).opacity = 0;
    }
  };

  return {
    grupo,
    izquierda,
    humo,
    animar,
    fumar: () => {
      if (reloj < 0) reloj = 0;
    },
    fumando: () => reloj >= 0,
    bailar: (activo: boolean) => {
      bailando = activo;
    },
  };
}
