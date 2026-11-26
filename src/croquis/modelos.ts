import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone as clonarConEsqueleto } from "three/examples/jsm/utils/SkeletonUtils.js";

/**
 * Personajes y animaciones de Mixamo (mixamo.com, gratis con cuenta de Adobe)
 * para el croquis 3D: la gente de la fiesta y el personaje que maneja la
 * persona. Los archivos están en `public/croquis/gente/` y se arman con
 * `scripts/gente/` (ver CLAUDE.md).
 *
 * Todos los personajes de Mixamo comparten los nombres de los huesos
 * (`mixamorigHips`, `mixamorigHead`…), así que una animación sirve para
 * cualquiera. Lo único que cambia entre cuerpos es el largo de los huesos: por
 * eso las animaciones traen sólo giros, más la cadera, que se lleva acá a la
 * medida de cada cuerpo.
 */

const BASE = "/croquis/gente/";
/** Alto de una persona, en metros (los modelos vienen en centímetros y cada uno a su escala). */
const ALTURA = 1.76;
export const CANT_PERSONAS = 8;

export type NombreAnim =
  | "quieto"
  | "charlar"
  | "tomar"
  | "fumar"
  | "caminar"
  | "correr"
  | "bailar1"
  | "bailar2"
  | "bailar3"
  | "bailar4";

export interface Plantilla {
  /** El personaje en su pose de reposo, ya a escala (no se agrega a la escena: se clona). */
  modelo: THREE.Group;
  clips: Map<NombreAnim, THREE.AnimationClip>;
  materiales: THREE.MeshStandardMaterial[];
}

export interface Recursos {
  yo: Promise<Plantilla>;
  /** Una promesa por persona: la gente aparece a medida que llegan. */
  gente: Promise<Plantilla>[];
}

const cargador = new GLTFLoader();
cargador.setMeshoptDecoder(MeshoptDecoder);


const buscar = (raiz: THREE.Object3D, nombre: string) => {
  let hallado: THREE.Object3D | undefined;
  raiz.traverse((o) => {
    if (!hallado && o.name === nombre) hallado = o;
  });
  return hallado;
};

/** Las animaciones, llevadas a la medida de un cuerpo (la cadera). */
function adaptar(anims: GLTF, modelo: THREE.Object3D): Map<NombreAnim, THREE.AnimationClip> {
  const caderaAnim = buscar(anims.scene, "mixamorigHips")?.position ?? new THREE.Vector3(0, 1, 0);
  const caderaCuerpo = buscar(modelo, "mixamorigHips")?.position ?? caderaAnim;
  const k = caderaCuerpo.length() / (caderaAnim.length() || 1);
  const clips = new Map<NombreAnim, THREE.AnimationClip>();
  for (const c of anims.animations) {
    const copia = c.clone();
    for (const tr of copia.tracks) {
      if (tr.name !== "mixamorigHips.position") continue;
      const v = tr.values;
      for (let i = 0; i < v.length; i += 3) {
        v[i] = caderaCuerpo.x + (v[i] - caderaAnim.x) * k;
        v[i + 1] = caderaCuerpo.y + (v[i + 1] - caderaAnim.y) * k;
        v[i + 2] = caderaCuerpo.z + (v[i + 2] - caderaAnim.z) * k;
      }
    }
    clips.set(c.name as NombreAnim, copia);
  }
  return clips;
}

function preparar(gltf: GLTF, anims: GLTF, sombras: boolean): Plantilla {
  const interno = gltf.scene;
  interno.updateMatrixWorld(true);
  const materiales = new Set<THREE.MeshStandardMaterial>();
  interno.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isMesh) return;
    m.castShadow = sombras;
    // El bind es la pose en T: bailando, los brazos salen de esa caja y el
    // personaje desaparecería en los bordes de la pantalla.
    m.frustumCulled = false;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      const std = mat as THREE.MeshStandardMaterial;
      // Pestañas y pelo traen transparencia en la textura.
      if (/lash|hair|brow/i.test(std.name + m.name)) {
        std.alphaTest = 0.4;
        std.transparent = false;
        std.side = THREE.DoubleSide;
      }
      std.emissiveMap = std.map;
      materiales.add(std);
    }
  });
  const caja = new THREE.Box3().setFromObject(interno);
  const alto = caja.max.y - caja.min.y || ALTURA;
  const modelo = new THREE.Group();
  modelo.add(interno);
  interno.scale.setScalar(ALTURA / alto);
  interno.position.y = -caja.min.y * (ALTURA / alto);
  return { modelo, clips: adaptar(anims, interno), materiales: [...materiales] };
}

export function cargarRecursos(op: { movil: boolean; sombras: boolean }): Recursos {
  // El celular baja su versión (`movil/`): texturas a la mitad, la mitad de
  // triángulos y animaciones a 10 cuadros por segundo. ~800 KB en total.
  const carpeta = BASE + (op.movil ? "movil/" : "");
  const cargar = (archivo: string) => cargador.loadAsync(carpeta + archivo);
  const anims = cargar("animaciones.glb");
  const yo = Promise.all([cargar("yo.glb"), anims]).then(([g, a]) => preparar(g, a, op.sombras));
  // En el celular, menos variedad de gente (cada una son ~115 KB).
  const cuantas = op.movil ? 4 : CANT_PERSONAS;
  const gente = Array.from({ length: cuantas }, (_, i) =>
    // La gente se pide después del personaje propio, que es lo primero que se ve.
    yo
      .catch(() => null)
      .then(() => Promise.all([cargar(`persona-${i + 1}.glb`), anims]))
      .then(([g, a]) => preparar(g, a, false))
  );
  return { yo, gente };
}

/** Un personaje listo para animar (comparte geometría y materiales con su plantilla). */
export function clonar(p: Plantilla): THREE.Object3D {
  return clonarConEsqueleto(p.modelo);
}

export { buscar };
