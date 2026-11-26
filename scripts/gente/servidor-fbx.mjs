// Servidor local para convertir FBX a GLB en el navegador (FBXLoader +
// GLTFExporter de three). Sirve:
//   /                -> convertir.html
//   /three/...       -> node_modules/three del proyecto
//   /fbx/<nombre>    -> el .fbx de la carpeta de origen (sólo lectura)
//   /lista           -> los .fbx disponibles
//   POST /guardar/<nombre> -> guarda el .glb recibido en la carpeta de salida
import http from "http";
import fs from "fs";
import path from "path";

const [origen, salida, proyecto, puerto = "8091"] = process.argv.slice(2);
fs.mkdirSync(salida, { recursive: true });
const tipos = { ".js": "text/javascript", ".html": "text/html", ".fbx": "application/octet-stream" };
const aqui = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

http
  .createServer((req, res) => {
    const url = decodeURIComponent(req.url.split("?")[0]);
    const enviar = (archivo) => {
      if (!fs.existsSync(archivo)) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "Content-Type": tipos[path.extname(archivo)] || "application/octet-stream" });
      fs.createReadStream(archivo).pipe(res);
    };
    if (req.method === "POST" && url.startsWith("/guardar/")) {
      const nombre = path.basename(url.slice(9));
      const partes = [];
      req.on("data", (d) => partes.push(d));
      req.on("end", () => {
        fs.writeFileSync(path.join(salida, nombre), Buffer.concat(partes));
        res.writeHead(200).end("ok");
      });
      return;
    }
    if (url === "/") return enviar(path.join(aqui, "convertir.html"));
    if (url === "/lista") {
      const l = fs.readdirSync(origen).filter((f) => f.toLowerCase().endsWith(".fbx"));
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(l));
      return;
    }
    if (url.startsWith("/three/")) {
      const p = path.normalize(path.join(proyecto, "node_modules", "three", url.slice(7)));
      if (!p.startsWith(path.join(proyecto, "node_modules", "three"))) return res.writeHead(403).end();
      return enviar(p);
    }
    if (url.startsWith("/fbx/")) return enviar(path.join(origen, path.basename(url.slice(5))));
    res.writeHead(404).end();
  })
  .listen(Number(puerto), "127.0.0.1", () => console.log("listo en", puerto));
