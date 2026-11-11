/**
 * Prueba de los cálculos de la Historia de ODÍSEA (src/lib/historiaCalculo.ts):
 * resumen de un evento, ranking de compradores y lectura de planillas viejas.
 *
 *   npx esbuild src/lib/historiaCalculo.ts --bundle --format=esm --platform=node \
 *     --outfile=scripts/historia.bundle.mjs
 *   node scripts/probar-historia.mjs
 *   rm scripts/historia.bundle.mjs
 */
import { resumenDeVentas, rankingCompradores, leerHoja, fechaDelNombre, plata, normTelefono } from "./historia.bundle.mjs";

let fallas = 0;
const check = (n, ok, d = "") => {
  console.log(`${ok ? "ok " : "MAL"}  ${n}${ok ? "" : `  →  ${JSON.stringify(d)}`}`);
  if (!ok) fallas++;
};

// ─── Resumen ───
const v = (nombre, email, phone, cant, valor, tickets = []) => {
  const [firstName, ...r] = nombre.split(" ");
  return { firstName, lastName: r.join(" "), email, phone, quantity: cant, value: valor, tickets };
};
const ventas = [
  v("Ana Pérez", "ana@x.com", "099111222", 2, 1400, [{ name: "General", quantity: 2, unitPrice: 800 }]), // con promo
  v("Ana Pérez", "ANA@x.com", null, 1, 1500, [{ name: "VIP", quantity: 1, unitPrice: 1500 }]), // misma persona, otra compra
  v("Juan Gómez", null, "+598 99 333 444", 3, 2400, [
    { name: "General", quantity: 2, unitPrice: 800 },
    { name: "VIP", quantity: 1, unitPrice: 800 },
  ]),
  v("Vieja Sin Tipo", "vieja@x.com", null, 2, 1000),
];
const r = resumenDeVentas(ventas);
check("ventas, entradas y recaudado", r.ventas === 4 && r.entradas === 8 && r.recaudado === 6300, r);
check("Ana con dos compras es UN comprador", r.compradores.length === 3, r.compradores);
const ana = r.compradores.find((c) => c.name === "Ana Pérez");
check("…con sus entradas y plata sumadas", ana.entradas === 3 && ana.monto === 2900, ana);
const tipos = Object.fromEntries(r.porTipo.map((t) => [t.nombre, t]));
check("entradas por tipo", tipos.General.entradas === 4 && tipos.VIP.entradas === 2 && tipos["Sin tipo"].entradas === 2, r.porTipo);
check("los tipos suman exactamente lo recaudado", r.porTipo.reduce((a, t) => a + t.recaudado, 0) === 6300, r.porTipo);
check("la venta con promo reparte lo cobrado, no la lista", tipos.General.recaudado === 1400 + 1600, tipos.General);

// ─── Ranking ───
const ev = [
  { id: "h1", name: "Halloween 2025", eventDate: "2025-10-31" },
  { id: "h2", name: "Navidad 2025", eventDate: "2025-12-24" },
  { id: "h3", name: "Expo 2026", eventDate: "2026-10-16" },
];
const comp = (historyId, name, email, phone, entradas, monto, documentId = null) => ({ historyId, name, email, phone, documentId, entradas, monto });
const compradores = [
  comp("h1", "Ana P", "ana@x.com", null, 2, 1600),
  comp("h2", "Ana Pérez", null, "099 111 222", 1, 800), // sólo teléfono en la planilla
  comp("h3", "Ana Pérez", "ana@x.com", "+59899111222", 1, 900), // une mail y teléfono
  comp("h1", "Juan", "juan@x.com", null, 6, 4800),
  comp("h2", "Juan", "juan@x.com", null, 1, 800),
  comp("h3", "Uno Solo", "uno@x.com", null, 1, 900),
  comp("h3", "Otro Solo", "otro@x.com", null, 1, 900),
];
const rk = rankingCompradores(compradores, ev);
check("Ana, con mail en uno y teléfono en otro, es UNA persona", rk.filter((p) => p.name.startsWith("Ana")).length === 1, rk);
check("primero el que fue a más eventos (Ana, 3)", rk[0].name === "Ana Pérez" && rk[0].eventos === 3, rk[0]);
check("…aunque Juan compró más entradas", rk[1].name === "Juan" && rk[1].eventos === 2 && rk[1].entradas === 7, rk[1]);
check("el nombre es el del evento más nuevo", rk[0].name === "Ana Pérez");
check("sus fiestas, de la más nueva a la más vieja", rk[0].fiestas.map((f) => f.id).join() === "h3,h2,h1", rk[0].fiestas);
check("empatados comparten el puesto", rk[2].puesto === 3 && rk[3].puesto === 3, rk.map((p) => p.puesto));

// ─── Planillas ───
const hoja = [
  ["ODISEA VENTA HALLOWEEN"],
  ["", "Nombre del comprador", "PRECIO UNITARIO", "Teléfono", "Mail", "Tipo de entrada", "Cantidad", "Confirmacion", "", "TOTAL VENTA"],
  ["$1.600", "Ana Pérez", "$800", "098 111 222", "ana@x.com", "General", "2", "si", "", "$9.999"],
  ["", "", "", "", "", "General", "", "", "", ""], // fila de plantilla
  ["", "Sin Precio", "", "", "sp@x.com", "", "1", "", "", ""],
];
const leida = leerHoja("Halloween 31/10/2025", hoja);
check("lee las filas con persona y saltea la plantilla", leida.ventas.length === 2, leida);
check("total de la columna sin título antes del nombre", leida.ventas[0].value === 1600, leida.ventas[0]);
check("no confunde TOTAL VENTA del costado con el total", leida.ventas[0].value !== 9999);
check("tipo y cantidad", leida.ventas[0].tickets[0].name === "General" && leida.ventas[0].quantity === 2);
check("avisa la fila sin precio", leida.avisos.length === 1, leida.avisos);
check("una hoja sin encabezado de ventas no es una hoja de ventas", leerHoja("Resumen", [["fiesta", "slug"], ["x", "y"]]) === null);
const exportada = [["Precio total", "Nombre del comprador", "PRECIO UNITARIO", "Teléfono", "Mail", "Tipo de entrada", "Cantidad"], [2400, "Juan", 800, "59899333444", "j@x.com", "VIP", 3]];
check("lee también la planilla que exporta el panel (con números)", leerHoja("Navidad", exportada).ventas[0].value === 2400);
check("fecha del nombre de la hoja", fechaDelNombre("Halloween 31/10/2025") === "2025-10-31" && fechaDelNombre("Navidad 24-12-25") === "2025-12-24" && fechaDelNombre("Expo") === "");
check("plata: $1.500 y 1500,50", plata("$1.500") === 1500 && plata("1500,50") === 1500.5);
check("teléfono local y con país dan lo mismo", normTelefono("098 111 222") === normTelefono("+598 98 111 222"));

console.log(fallas ? `\n${fallas} falla(s)` : "\nTodo bien");
process.exit(fallas ? 1 : 0);
