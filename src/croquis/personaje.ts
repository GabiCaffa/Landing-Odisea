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
function texturaVaso(): THREE.CanvasTexture {
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
  /** `paso` 0 = quieto, 1 = caminando, ~1,8 = corriendo. */
  animar(t: number, paso: number): void;
}

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

  const animar = (t: number, paso: number) => {
    const p = Math.min(paso, 2);
    const fase = t * (5.5 + p * 2.5);
    // Al caminar se mece; quieto, apenas respira.
    const amp = 0.012 * Math.min(p, 1.6);
    brazo.position.x = Math.sin(fase * 0.5) * amp;
    brazo.position.y = p > 0.05 ? -Math.abs(Math.sin(fase)) * amp * 1.2 : Math.sin(t * 1.8) * 0.003;
    brazo.rotation.z = Math.sin(fase * 0.5) * amp * 1.5;
  };

  return { grupo, animar };
}
