// Arma los modelos livianos de la gente del croquis 3D a partir de los
// paquetes gratis de Quaternius (CC0):
//   - Universal Base Characters [Standard] (cuerpos con cara y peinados)
//   - Universal Animation Library [Standard] (animaciones)
//
// Los paquetes se bajan gratis de quaternius.itch.io (versión "Standard") y NO
// van al repo (pesan 140 MB). Las herramientas tampoco son dependencias del
// sitio: se instalan en una carpeta aparte, donde se copian estos dos scripts:
//   npm i @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4 meshoptimizer sharp
//
// 1. Los .gltf de Quaternius apuntan a algunos mapas de normales que no vienen
//    en el zip. rellenar-texturas.mjs copia cada carpeta y los crea vacíos:
//      node rellenar-texturas.mjs "<UBC>/Base Characters/Godot - UE" "<trabajo>/Base Characters/Godot - UE"
//      node rellenar-texturas.mjs "<UBC>/Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)" "<trabajo>/Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)"
//      y copiar "<UBC>/Base Characters/Textures" a "<trabajo>/Base Characters/"
// 2. node armar-personas.mjs <trabajo> <UAL1_Standard.glb> <repo>/public/croquis/gente
//
// Salen cuatro archivos:
//   cuerpo-m.glb / cuerpo-f.glb  cuerpo + ojos + cejas, con esqueleto (65 huesos)
//   pelos.glb                    peinados SIN esqueleto, en el espacio del hueso Head
//                                (se cuelgan de la cabeza de cada persona)
//   animaciones.glb              sólo las animaciones elegidas, sin malla
import path from "path";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, resample, simplify, textureCompress, weld } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const [ubc, ual, salida] = process.argv.slice(2);
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });

const CUERPOS = path.join(ubc, "Base Characters", "Godot - UE");
const TEXTURAS = path.join(ubc, "Base Characters", "Textures");
const PELOS = path.join(ubc, "Hairstyles", "Rigged to Head Bone", "glTF (Godot -Unreal)");

// Atributos que el sitio no usa: UV extra, colores de vértice (máscaras del
// shader de Quaternius) y tangentes.
const limpiarAtributos = (doc) => {
  for (const m of doc.getRoot().listMeshes())
    for (const p of m.listPrimitives())
      for (const s of p.listSemantics())
        if (!/^(POSITION|NORMAL|TEXCOORD_0|JOINTS_0|WEIGHTS_0)$/.test(s)) p.setAttribute(s, null);
};
// Sin mapas de normales ni de rugosidad: a la distancia de una fiesta no se
// ven y son lo que más pesa.
const limpiarMateriales = (doc) => {
  for (const mt of doc.getRoot().listMaterials()) {
    mt.setNormalTexture(null);
    mt.setMetallicRoughnessTexture(null);
    mt.setMetallicFactor(0);
    mt.setRoughnessFactor(0.75);
  }
};
const terminar = async (doc, archivo, { lado = 512, simplificar = 0 } = {}) => {
  limpiarAtributos(doc);
  limpiarMateriales(doc);
  const pasos = [dedup(), prune({ keepLeaves: true }), weld()];
  if (simplificar) pasos.push(simplify({ simplifier: MeshoptSimplifier, ratio: simplificar, error: 0.0008 }));
  pasos.push(
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [lado, lado], quality: 82 }),
    meshopt({ encoder: MeshoptEncoder, level: "medium" })
  );
  await doc.transform(...pasos);
  await io.write(path.join(salida, archivo), doc);
};

// --- Cuerpos ----------------------------------------------------------------
// Con la piel CLARA: el tono se da multiplicando por un color en el sitio, y
// multiplicar sólo puede oscurecer.
const cuerpo = async (archivoGltf, pielClara, salidaGlb) => {
  const doc = await io.read(path.join(CUERPOS, archivoGltf));
  const piel = doc.getRoot().listMaterials().find((m) => /Superhero/.test(m.getName()));
  const tex = piel.getBaseColorTexture();
  const png = await sharp(path.join(TEXTURAS, pielClara)).png().toBuffer();
  tex.setImage(new Uint8Array(png)).setMimeType("image/png");
  await terminar(doc, salidaGlb, { lado: 1024, simplificar: 0.6 });
};
await cuerpo("Superhero_Male_FullBody.gltf", "T_Superhero_Male_Ligh.png", "cuerpo-m.glb");
await cuerpo("Superhero_Female_FullBody.gltf", "T_Superhero_Female_Light_BaseColor.png", "cuerpo-f.glb");

// --- Peinados -----------------------------------------------------------------
// Cada peinado viene con su esqueleto entero pero pesado sólo al hueso Head. Se
// pasan los vértices al espacio de ese hueso (la matriz inversa de bind) y se
// guardan como malla común: en el sitio se cuelgan de la cabeza de cada persona.
const ESTILOS = ["Hair_Buzzed", "Hair_SimpleParted", "Hair_Long", "Hair_Buns", "Hair_BuzzedFemale", "Hair_Beard"];
const pelos = new Document();
const buf = pelos.createBuffer();
const escena = pelos.createScene("pelos");
const mats = new Map();
const mul = (m, v) => [
  m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
  m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
  m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
];
const rot = (m, v) => {
  const r = [m[0] * v[0] + m[4] * v[1] + m[8] * v[2], m[1] * v[0] + m[5] * v[1] + m[9] * v[2], m[2] * v[0] + m[6] * v[1] + m[10] * v[2]];
  const l = Math.hypot(...r) || 1;
  return r.map((x) => x / l);
};
for (const estilo of ESTILOS) {
  const src = await io.read(path.join(PELOS, estilo + ".gltf"));
  const nodo = src.getRoot().listNodes().find((n) => n.getMesh());
  const skin = nodo.getSkin();
  const juntas = skin.listJoints();
  const iHead = juntas.findIndex((j) => j.getName() === "Head");
  const ibm = skin.getInverseBindMatrices().getElement(iHead, []);
  const prim = nodo.getMesh().listPrimitives()[0];
  const pos = prim.getAttribute("POSITION");
  const nor = prim.getAttribute("NORMAL");
  const uv = prim.getAttribute("TEXCOORD_0");
  const jn = prim.getAttribute("JOINTS_0");
  const n = pos.getCount();
  let otros = 0;
  const P = new Float32Array(n * 3);
  const N = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const j4 = jn.getElement(i, []);
    if (j4.some((x, k) => x !== iHead && prim.getAttribute("WEIGHTS_0").getElement(i, [])[k] > 0.01)) otros++;
    P.set(mul(ibm, pos.getElement(i, [])), i * 3);
    N.set(rot(ibm, nor.getElement(i, [])), i * 3);
  }
  if (otros) console.warn(`${estilo}: ${otros} vértices pesados a otro hueso`);
  const matSrc = prim.getMaterial();
  const texSrc = matSrc.getBaseColorTexture();
  let mat = mats.get(texSrc.getURI());
  if (!mat) {
    const tex = pelos.createTexture(texSrc.getName()).setImage(texSrc.getImage()).setMimeType(texSrc.getMimeType());
    mat = pelos.createMaterial(matSrc.getName()).setBaseColorTexture(tex);
    mats.set(texSrc.getURI(), mat);
  }
  const p = pelos
    .createPrimitive()
    .setMaterial(mat)
    .setIndices(pelos.createAccessor().setArray(new Uint32Array(prim.getIndices().getArray())).setType("SCALAR").setBuffer(buf))
    .setAttribute("POSITION", pelos.createAccessor().setArray(P).setType("VEC3").setBuffer(buf))
    .setAttribute("NORMAL", pelos.createAccessor().setArray(N).setType("VEC3").setBuffer(buf))
    .setAttribute("TEXCOORD_0", pelos.createAccessor().setArray(new Float32Array(uv.getArray())).setType("VEC2").setBuffer(buf));
  const malla = pelos.createMesh(estilo).addPrimitive(p);
  escena.addChild(pelos.createNode(estilo).setMesh(malla));
}
await terminar(pelos, "pelos.glb", { lado: 512 });

// --- Animaciones --------------------------------------------------------------
// Las de Quaternius traen traslación y escala en TODOS los huesos, con las
// medidas del maniquí. Aplicadas tal cual, cada cuerpo tomaría esas medidas.
// Se dejan sólo los giros, y la traslación de la pelvis como DIFERENCIA con su
// posición de reposo (en el sitio se le suma la del cuerpo), que es lo que hace
// subir y bajar la cadera al bailar o caminar.
const CLIPS = {
  Dance_Loop: "bailar",
  Idle_Loop: "quieto",
  Idle_Talking_Loop: "charlar",
  Walk_Loop: "caminar",
  Jog_Fwd_Loop: "trotar",
  Interact: "brindar",
};
const anim = await io.read(ual);
for (const a of anim.getRoot().listAnimations()) {
  const nombre = CLIPS[a.getName()];
  if (!nombre) {
    a.dispose();
    continue;
  }
  a.setName(nombre);
  for (const c of a.listChannels()) {
    const nodo = c.getTargetNode();
    const ruta = c.getTargetPath();
    const pelvis = nodo.getName() === "pelvis";
    if (ruta === "scale" || (ruta === "translation" && !pelvis) || (nodo.getName() === "root" && ruta !== "rotation")) {
      const s = c.getSampler();
      c.dispose();
      s.dispose();
      continue;
    }
    if (ruta === "translation" && pelvis) {
      const rep = nodo.getTranslation();
      const out = c.getSampler().getOutput();
      const arr = new Float32Array(out.getArray());
      for (let i = 0; i < arr.length; i += 3) for (let k = 0; k < 3; k++) arr[i + k] -= rep[k];
      out.setArray(arr);
    }
  }
}
for (const n of anim.getRoot().listNodes()) {
  if (n.getMesh()) n.setMesh(null);
  if (n.getSkin()) n.setSkin(null);
}
// Los accesores de las animaciones descartadas quedan colgados de la raíz:
// se borran los que ya no usa nadie (los de entrada se comparten entre clips).
const usados = new Set();
for (const a of anim.getRoot().listAnimations())
  for (const c of a.listChannels()) usados.add(c.getSampler().getInput()).add(c.getSampler().getOutput());
for (const a of anim.getRoot().listAccessors()) if (!usados.has(a)) a.dispose();
await anim.transform(dedup(), resample({ tolerance: 0.0005 }), prune({ keepLeaves: true }), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
await io.write(path.join(salida, "animaciones.glb"), anim);
console.log("listo");
