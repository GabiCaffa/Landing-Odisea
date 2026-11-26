import * as THREE from "three";
import { texturaVaso } from "./personaje";

/**
 * Lo que tienen en la mano los personajes del croquis: el vaso de ODÍSEA y el
 * cigarro. En metros, con el centro en el medio del objeto. Hechos con
 * geometría simple y compartida (una sola textura de vaso para todos).
 */

const NARANJA = "#F25C26";
let compartido: {
  lado: THREE.MeshStandardMaterial;
  negro: THREE.MeshStandardMaterial;
  bebida: THREE.MeshStandardMaterial;
  blanco: THREE.MeshStandardMaterial;
  naranja: THREE.MeshStandardMaterial;
} | null = null;

const materiales = () =>
  (compartido ??= {
    lado: new THREE.MeshStandardMaterial({ map: texturaVaso(), roughness: 0.35, side: THREE.DoubleSide }),
    negro: new THREE.MeshStandardMaterial({ color: "#111114", roughness: 0.6 }),
    bebida: new THREE.MeshStandardMaterial({ color: "#f2a93b", emissive: "#f2a93b", emissiveIntensity: 0.25, roughness: 0.15 }),
    blanco: new THREE.MeshStandardMaterial({ color: "#f4f4f4", roughness: 0.5 }),
    naranja: new THREE.MeshStandardMaterial({ color: NARANJA, emissive: NARANJA, emissiveIntensity: 0.2, roughness: 0.6 }),
  });

/** El vaso negro con el logo, bebida y sorbete naranja (15 cm de alto). */
export function crearVasoOdisea(): THREE.Group {
  const m = materiales();
  const vaso = new THREE.Group();
  const alto = 0.15;
  const lado = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.036, alto, 20, 1, true), m.lado);
  lado.rotation.y = Math.PI / 2;
  vaso.add(lado);
  const fondo = new THREE.Mesh(new THREE.CircleGeometry(0.036, 16), m.negro);
  fondo.rotation.x = Math.PI / 2;
  fondo.position.y = -alto / 2;
  vaso.add(fondo);
  const bebida = new THREE.Mesh(new THREE.CircleGeometry(0.043, 16), m.bebida);
  bebida.rotation.x = -Math.PI / 2;
  bebida.position.y = alto / 2 - 0.016;
  vaso.add(bebida);
  const borde = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.0035, 5, 20), m.blanco);
  borde.rotation.x = Math.PI / 2;
  borde.position.y = alto / 2;
  vaso.add(borde);
  const sorbete = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.19, 6), m.naranja);
  sorbete.position.set(-0.016, alto / 2 + 0.03, 0.004);
  sorbete.rotation.z = 0.25;
  vaso.add(sorbete);
  return vaso;
}

export interface Cigarro {
  grupo: THREE.Group;
  /** La brasa, para avivarla al pitar. */
  brasa: THREE.MeshStandardMaterial;
  /** La punta, de donde sale el humo. */
  punta: THREE.Object3D;
}

/** Un cigarro de 8 cm acostado sobre el eje x (la brasa en +x). */
export function crearCigarro(): Cigarro {
  const grupo = new THREE.Group();
  const papel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0045, 0.0045, 0.06, 8),
    new THREE.MeshStandardMaterial({ color: "#f3f1ea", roughness: 0.8 })
  );
  papel.position.y = 0.01;
  grupo.add(papel);
  const filtro = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0046, 0.0046, 0.02, 8),
    new THREE.MeshStandardMaterial({ color: "#d58a3a", roughness: 0.7 })
  );
  filtro.position.y = -0.03;
  grupo.add(filtro);
  const brasa = new THREE.MeshStandardMaterial({ color: "#ff5a1f", emissive: "#ff4410", emissiveIntensity: 0.6 });
  const punta = new THREE.Mesh(new THREE.CylinderGeometry(0.0047, 0.0047, 0.008, 8), brasa);
  punta.position.y = 0.044;
  grupo.add(punta);
  grupo.rotation.z = -Math.PI / 2;
  const cont = new THREE.Group();
  cont.add(grupo);
  return { grupo: cont, brasa, punta };
}

/** Una nube suave para el humo. */
let texHumo: THREE.CanvasTexture | null = null;
export function texturaHumo(): THREE.CanvasTexture {
  if (texHumo) return texHumo;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(242,242,246,1)");
  g.addColorStop(0.45, "rgba(220,220,228,0.8)");
  g.addColorStop(1, "rgba(210,210,220,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  texHumo = new THREE.CanvasTexture(c);
  return texHumo;
}
