import * as THREE from "three";

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

  // Manga y puño, entrando desde abajo a la derecha.
  const manga = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.42, 14), buzo);
  manga.rotation.set(-1.15, 0, 0.35);
  manga.position.set(0.07, -0.17, 0.14);
  brazo.add(manga);
  const puno = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.05, 14), naranja);
  puno.rotation.copy(manga.rotation);
  puno.position.set(0.012, -0.075, -0.035);
  brazo.add(puno);

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

  // La mano agarrando el vaso: palma del lado de afuera y cuatro dedos que lo
  // rodean por delante; el pulgar del lado de adentro.
  const palma = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.085, 0.075), piel);
  palma.position.set(0.058, -0.01, 0.01);
  brazo.add(palma);
  for (let i = 0; i < 4; i++) {
    const dedo = new THREE.Mesh(new THREE.CapsuleGeometry(0.0115, 0.05, 3, 8), piel);
    dedo.rotation.z = Math.PI / 2;
    dedo.rotation.y = 0.55;
    dedo.position.set(0.035, 0.022 - i * 0.022, -0.04);
    brazo.add(dedo);
  }
  const pulgar = new THREE.Mesh(new THREE.CapsuleGeometry(0.013, 0.045, 3, 8), piel);
  pulgar.rotation.set(0.4, 0, -0.5);
  pulgar.position.set(0.03, 0.035, 0.045);
  brazo.add(pulgar);

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
