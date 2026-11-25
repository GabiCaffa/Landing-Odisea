import * as THREE from "three";

/**
 * El personaje que camina por el croquis: un pibe de buzo negro, jean y
 * zapatillas naranjas, con un vaso de ODÍSEA en la mano derecha.
 *
 * Hecho con la misma regla que el resto del croquis: cajas, esferas y
 * cilindros, sin modelos que bajar. Es un diseño propio, no el de ningún
 * juego. Las proporciones son de muñeco (cabeza y vaso grandes) para que se
 * lea desde la cámara, que lo sigue a unos metros.
 *
 * El origen está en los pies y el frente mira a +z. Lo mueve el motor; acá sólo
 * se arma y se anima (piernas, brazo libre, el vaso que se balancea un poco).
 */

const NARANJA = "#F25C26";

/** El vaso: negro, borde naranja y el logo blanco dos veces, para verlo de los dos lados. */
function texturaVaso(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 320;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#111114";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = NARANJA;
  ctx.fillRect(0, 0, c.width, 44);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  // El logo del sitio (blanco sobre transparente, 500×500 con la palabra en
  // la franja del medio). Si no carga, el vaso queda negro con el borde: no
  // es motivo para no mostrar al personaje.
  const img = new Image();
  img.onload = () => {
    const [sx, sy, sw, sh] = [80, 185, 345, 115];
    const ancho = 300;
    const alto = (ancho * sh) / sw;
    for (const cx of [c.width * 0.25, c.width * 0.75]) {
      ctx.drawImage(img, sx, sy, sw, sh, cx - ancho / 2, 160 - alto / 2 + 18, ancho, alto);
    }
    tex.needsUpdate = true;
  };
  img.src = "/email-logo-white.png";
  return tex;
}

export interface Personaje {
  grupo: THREE.Group;
  /** `paso` 0 = quieto, 1 = caminando, ~1,8 = corriendo. */
  animar(t: number, paso: number): void;
}

export function crearPersonaje(): Personaje {
  const mat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.75, flatShading: true, ...extra });
  const piel = mat("#e7b48e");
  const buzo = mat("#17171b");
  const jean = mat("#2b3f63");
  const zapa = mat("#f4f4f4");
  const naranja = mat(NARANJA, { emissive: NARANJA, emissiveIntensity: 0.25 });
  const pelo = mat("#2a1a12");

  const caja = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    return mesh;
  };

  const grupo = new THREE.Group();
  const cuerpo = new THREE.Group(); // lo que rebota al caminar
  grupo.add(cuerpo);

  // Piernas: el pivote en la cadera, para que giren desde ahí.
  const pierna = (x: number) => {
    const p = new THREE.Group();
    p.position.set(x, 0.86, 0);
    p.add(caja(0.22, 0.78, 0.26, jean, 0, -0.39, 0));
    p.add(caja(0.25, 0.12, 0.38, zapa, 0, -0.8, 0.05));
    p.add(caja(0.26, 0.05, 0.39, naranja, 0, -0.85, 0.05));
    cuerpo.add(p);
    return p;
  };
  const piernaIzq = pierna(0.14);
  const piernaDer = pierna(-0.14);

  // Torso: buzo con capucha y una franja naranja en el pecho.
  cuerpo.add(caja(0.6, 0.68, 0.34, buzo, 0, 1.2, 0));
  cuerpo.add(caja(0.61, 0.07, 0.35, naranja, 0, 1.3, 0));
  cuerpo.add(caja(0.42, 0.22, 0.14, buzo, 0, 1.5, -0.2));

  // Cabeza grande, de muñeco.
  const cabeza = new THREE.Group();
  cabeza.position.set(0, 1.78, 0);
  const cara = new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 10), piel);
  cara.castShadow = true;
  cabeza.add(cara);
  const gorro = new THREE.Mesh(new THREE.SphereGeometry(0.285, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.1), pelo);
  gorro.rotation.x = -0.25;
  cabeza.add(gorro);
  const ojo = mat("#111111");
  cabeza.add(caja(0.05, 0.07, 0.03, ojo, 0.09, 0.02, 0.255));
  cabeza.add(caja(0.05, 0.07, 0.03, ojo, -0.09, 0.02, 0.255));
  cuerpo.add(cabeza);

  // Brazos. El izquierdo se balancea; el derecho va doblado hacia adelante
  // con el vaso, como quien camina con una bebida.
  const brazo = (x: number) => {
    const b = new THREE.Group();
    b.position.set(x, 1.48, 0);
    b.add(caja(0.16, 0.58, 0.18, buzo, 0, -0.29, 0));
    const mano = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), piel);
    mano.position.y = -0.62;
    b.add(mano);
    cuerpo.add(b);
    return b;
  };
  const brazoIzq = brazo(0.4);
  const brazoDer = brazo(-0.4);
  const LEVANTADO = -1.05;
  brazoDer.rotation.x = LEVANTADO;

  // El vaso, en la mano derecha y siempre parado (contra-rotado al brazo).
  const vaso = new THREE.Group();
  vaso.position.set(0, -0.66, 0.03);
  vaso.rotation.x = -LEVANTADO;
  const alto = 0.34;
  const lado = new THREE.Mesh(
    new THREE.CylinderGeometry(0.135, 0.1, alto, 24, 1, true),
    new THREE.MeshStandardMaterial({ map: texturaVaso(), roughness: 0.45, side: THREE.DoubleSide })
  );
  lado.position.y = alto / 2 - 0.06;
  // El cilindro arranca su textura mirando al costado (+x): girado, los dos
  // logos quedan uno al frente y otro atrás.
  lado.rotation.y = -Math.PI / 2;
  lado.castShadow = true;
  vaso.add(lado);
  const fondo = new THREE.Mesh(new THREE.CircleGeometry(0.1, 20), mat("#111114"));
  fondo.rotation.x = Math.PI / 2;
  fondo.position.y = -0.06;
  vaso.add(fondo);
  const bebida = new THREE.Mesh(
    new THREE.CircleGeometry(0.128, 20),
    new THREE.MeshStandardMaterial({ color: "#f2a93b", emissive: "#f2a93b", emissiveIntensity: 0.35, roughness: 0.2 })
  );
  bebida.rotation.x = -Math.PI / 2;
  bebida.position.y = alto - 0.09;
  vaso.add(bebida);
  const borde = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.012, 6, 24), mat("#f4f4f4"));
  borde.rotation.x = Math.PI / 2;
  borde.position.y = alto - 0.06;
  vaso.add(borde);
  // El vaso se sostiene con la mano por el costado: se corre un poco hacia
  // adentro para que la mano quede "agarrándolo".
  vaso.position.x = 0.06;
  // Más grande que uno de verdad: es el protagonista.
  vaso.scale.setScalar(1.5);
  brazoDer.add(vaso);

  // Una luz suave que lo acompaña: de noche, con buzo negro, se perdía contra el piso.
  const luz = new THREE.PointLight("#ffe2c4", 22, 9, 2);
  luz.position.set(0, 2.7, 1.4);
  grupo.add(luz);

  const animar = (t: number, paso: number) => {
    const p = Math.min(paso, 2);
    const fase = t * (5.5 + p * 2.5);
    const amp = 0.55 * Math.min(p, 1.4);
    piernaIzq.rotation.x = Math.sin(fase) * amp;
    piernaDer.rotation.x = -Math.sin(fase) * amp;
    brazoIzq.rotation.x = -Math.sin(fase) * amp * 0.9;
    // El brazo del vaso casi no se mueve: nadie camina revoleando la bebida.
    brazoDer.rotation.x = LEVANTADO + Math.sin(fase) * amp * 0.12;
    vaso.rotation.x = -brazoDer.rotation.x;
    // Rebote al caminar y respiración quieto.
    cuerpo.position.y = p > 0.05 ? Math.abs(Math.sin(fase)) * 0.06 * Math.min(p, 1.5) : Math.sin(t * 2) * 0.012;
    cabeza.rotation.z = p > 0.05 ? Math.sin(fase) * 0.04 : 0;
  };

  return { grupo, animar };
}
