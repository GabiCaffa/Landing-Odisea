// Arma los modelos livianos de la gente del croquis 3D a partir de personajes y
// animaciones de Mixamo (mixamo.com, gratis con cuenta de Adobe), ya pasados de
// FBX a GLB con scripts/gente/convertir.html (FBXLoader + GLTFExporter de three).
//
// Los FBX de Mixamo NO van al repo (pesan ~550 MB) y las herramientas no son
// dependencias del sitio. Pasos, en una carpeta aparte con estos tres archivos:
//   npm i @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4 meshoptimizer sharp
// 1. node servidor-fbx.mjs <carpeta con los .fbx> <carpeta de .glb> <repo> 8091
//    y abrir http://127.0.0.1:8091 en Chrome. En la consola:
//      await convertir("Remy.fbx")                          (personajes, en pose en T)
//      await convertir("Drinking.fbx", { animacion: true }) (animaciones, "Without Skin")
// 2. node armar-mixamo.mjs <carpeta de .glb> <repo>/public/croquis/gente
// Qué personaje es cada archivo y qué animaciones entran: YO, GENTE y ANIMS, abajo.
//
// Salen:
//   yo.glb               el personaje que maneja la persona (más detalle)
//   persona-<n>.glb      la gente (más liviana)
//   animaciones.glb      todas las animaciones sobre UN esqueleto, sin malla
import fs from "fs";
import path from "path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, mergeDocuments, meshopt, prune, resample, simplify, textureCompress, weld } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const [entrada, salida] = process.argv.slice(2);
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
fs.mkdirSync(salida, { recursive: true });

const YO = "Remy";
const GENTE = ["Ch23_nonPBR", "Ch37_nonPBR", "Ch21_nonPBR", "Ch22_nonPBR", "Ch02_nonPBR", "Ch08_nonPBR", "Ch26_nonPBR", "Ch28_nonPBR"];
const ANIMS = {
  "Breathing_Idle": "quieto",
  "Talking": "charlar",
  "Drinking": "tomar",
  "Smoking": "fumar",
  "Walking": "caminar",
  "Running": "correr",
  "Bboy_Hip_Hop_Move": "bailar1",
  "Brooklyn_Uprock": "bailar2",
  "Snake_Hip_Hop_Dance": "bailar3",
  "Dancing_Twerk": "bailar4",
};

const identidad = (n) => {
  const [t, r, s] = [n.getTranslation(), n.getRotation(), n.getScale()];
  return Math.hypot(...t) < 1e-4 && Math.abs(r[3]) > 0.99999 && s.every((x) => Math.abs(x - 1) < 1e-4);
};

/**
 * FBXLoader crea un hueso por cada esqueleto que lo usa (Mixamo arma uno por
 * prenda) y cuelga las copias del original, en su mismo lugar. Las animaciones
 * se enganchan por nombre y mueven sólo el primero: se juntan todas en él.
 */
function juntarHuesos(doc) {
  const root = doc.getRoot();
  let cambios = true;
  let quitados = 0;
  while (cambios) {
    cambios = false;
    for (const n of root.listNodes()) {
      const padre = n.getParentNode();
      if (!padre || padre.getName() !== n.getName() || n.getMesh() || !identidad(n)) continue;
      for (const skin of root.listSkins()) {
        const juntas = skin.listJoints();
        if (!juntas.includes(n)) continue;
        // Reemplazar la copia por el original, en el mismo lugar del arreglo.
        const nuevas = juntas.map((j) => (j === n ? padre : j));
        for (const j of juntas) skin.removeJoint(j);
        for (const j of nuevas) skin.addJoint(j);
        if (skin.getSkeleton() === n) skin.setSkeleton(padre);
      }
      for (const h of n.listChildren()) padre.addChild(h);
      n.dispose();
      quitados++;
      cambios = true;
    }
  }
  return quitados;
}

const limpiarMateriales = (doc) => {
  for (const mt of doc.getRoot().listMaterials()) {
    mt.setNormalTexture(null).setOcclusionTexture(null).setEmissiveTexture(null).setMetallicRoughnessTexture(null);
    mt.setMetallicFactor(0).setRoughnessFactor(0.8).setEmissiveFactor([0, 0, 0]);
  }
  for (const m of doc.getRoot().listMeshes())
    for (const p of m.listPrimitives())
      for (const s of p.listSemantics()) if (!/^(POSITION|NORMAL|TEXCOORD_0|JOINTS_0|WEIGHTS_0)$/.test(s)) p.setAttribute(s, null);
};

const tris = (doc) =>
  doc
    .getRoot()
    .listMeshes()
    .flatMap((m) => m.listPrimitives())
    .reduce((s, p) => s + (p.getIndices()?.getCount() ?? p.getAttribute("POSITION").getCount()) / 3, 0);

async function personaje(nombre, archivo, { lado, triangulos }) {
  const doc = await io.read(path.join(entrada, nombre + ".glb"));
  for (const a of doc.getRoot().listAnimations()) a.dispose();
  const quitados = juntarHuesos(doc);
  // Mixamo numera el prefijo de los huesos de algunos personajes (mixamorig2Hips,
  // mixamorig6Hips…): las animaciones se enganchan por nombre y no los encontraban.
  for (const n of doc.getRoot().listNodes()) n.setName(n.getName().replace(/^mixamorig\d+/, "mixamorig"));
  limpiarMateriales(doc);
  await doc.transform(dedup(), prune(), weld());
  const antes = tris(doc);
  const ratio = Math.min(1, triangulos / antes);
  if (ratio < 1) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.02, lockBorder: false }));
  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [lado, lado], quality: 72 }),
    prune(),
    meshopt({ encoder: MeshoptEncoder, level: "high" })
  );
  await io.write(path.join(salida, archivo), doc);
  const kb = Math.round(fs.statSync(path.join(salida, archivo)).size / 1024);
  console.log(`${archivo}: ${nombre}, huesos repetidos ${quitados}, triángulos ${Math.round(antes)} → ${Math.round(tris(doc))}, ${kb} KB`);
}

await personaje(YO, "yo.glb", { lado: 1024, triangulos: 14000 });
for (const [i, n] of GENTE.entries()) await personaje(n, `persona-${i + 1}.glb`, { lado: 512, triangulos: 7000 });

// --- Animaciones ---------------------------------------------------------------
// Todas sobre el esqueleto de la primera: se mezclan los documentos y cada canal
// pasa a apuntar al hueso del mismo nombre del primero. Se dejan los giros y la
// traslación de la cadera (como venga: en el sitio se lleva a la medida de cada
// cuerpo). Caminar y correr, en el lugar: sin avance en el piso.
const nombres = Object.keys(ANIMS);
const base = await io.read(path.join(entrada, nombres[0] + ".glb"));
for (const n of nombres.slice(1)) mergeDocuments(base, await io.read(path.join(entrada, n + ".glb")));
const root = base.getRoot();
const escena0 = root.listScenes()[0];
const huesosBase = new Map();
const recorrer = (n) => {
  if (!huesosBase.has(n.getName())) huesosBase.set(n.getName(), n);
  n.listChildren().forEach(recorrer);
};
escena0.listChildren().forEach(recorrer);
root.listAnimations().forEach((a, i) => a.setName(ANIMS[nombres[i]]));
for (const a of root.listAnimations()) {
  const enLugar = a.getName() === "caminar" || a.getName() === "correr";
  for (const c of a.listChannels()) {
    const hueso = huesosBase.get(c.getTargetNode().getName());
    const ruta = c.getTargetPath();
    const cadera = /Hips$/.test(c.getTargetNode().getName());
    if (!hueso || ruta === "scale" || (ruta === "translation" && !cadera)) {
      const s = c.getSampler();
      c.dispose();
      s.dispose();
      continue;
    }
    c.setTargetNode(hueso);
    if (enLugar && ruta === "translation") {
      const out = c.getSampler().getOutput();
      const arr = new Float32Array(out.getArray());
      const rep = hueso.getTranslation();
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] = rep[0];
        arr[i + 2] = rep[2];
      }
      out.setArray(arr);
    }
  }
}
// A 15 cuadros por segundo: en una multitud no se nota y pesa la mitad.
const vistos = new Set();
for (const a of root.listAnimations())
  for (const smp of a.listSamplers()) {
    if (!smp.getInput() || vistos.has(smp)) continue;
    vistos.add(smp);
    const inp = smp.getInput().getArray();
    const out = smp.getOutput();
    const n = out.getElementSize();
    const o = out.getArray();
    const ki = [], ko = [];
    for (let i = 0; i < inp.length; i += 2) {
      ki.push(inp[i]);
      for (let k = 0; k < n; k++) ko.push(o[i * n + k]);
    }
    if ((inp.length - 1) % 2) {
      ki.push(inp[inp.length - 1]);
      for (let k = 0; k < n; k++) ko.push(o[(inp.length - 1) * n + k]);
    }
    smp.setInput(base.createAccessor().setArray(new Float32Array(ki)).setType("SCALAR"));
    out.setArray(new Float32Array(ko));
  }
for (const s of root.listScenes().slice(1)) {
  s.listChildren().forEach((n) => n.dispose());
  s.dispose();
}
const usados = new Set();
for (const a of root.listAnimations()) for (const c of a.listChannels()) usados.add(c.getSampler().getInput()).add(c.getSampler().getOutput());
for (const a of root.listAccessors()) if (!usados.has(a)) a.dispose();
// Un solo buffer.
const [buf, ...otros] = root.listBuffers();
for (const a of root.listAccessors()) a.setBuffer(buf);
otros.forEach((b) => b.dispose());
await base.transform(resample({ tolerance: 0.0015 }), dedup(), prune({ keepLeaves: true }), meshopt({ encoder: MeshoptEncoder, level: "high" }));
await io.write(path.join(salida, "animaciones.glb"), base);
console.log("animaciones.glb", root.listAnimations().map((a) => `${a.getName()}:${a.listChannels().length}`).join(" "), Math.round(fs.statSync(path.join(salida, "animaciones.glb")).size / 1024), "KB");
