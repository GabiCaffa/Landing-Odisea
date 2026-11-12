/**
 * Prueba de los filtros de Entregas (src/lib/filtrosEntregas.ts). Para correrla:
 *
 *   npx esbuild src/lib/filtrosEntregas.ts --bundle --format=esm --platform=node \
 *     --outfile=scripts/filtrosEntregas.bundle.mjs
 *   node scripts/probar-filtros-entregas.mjs
 *   rm scripts/filtrosEntregas.bundle.mjs
 */
import {
  FILTROS_INICIALES,
  SIN_DESGLOSE,
  TODOS,
  entradasPorTipo,
  entradasQueCuentan,
  eventoPorDefecto,
  filtrosEnDesplegables,
  hayFiltrosExtra,
  limpiarFiltros,
  opcionesPrecios,
  ordenar,
  opcionesEventos,
  opcionesTipos,
  pasaFiltros,
} from "./filtrosEntregas.bundle.mjs";

let fallas = 0;
const check = (nombre, ok, detalle = "") => {
  console.log(`${ok ? "ok " : "MAL"}  ${nombre}${ok ? "" : `  →  ${JSON.stringify(detalle)}`}`);
  if (!ok) fallas++;
};

const linea = (id, name, quantity) => ({ ticketTypeId: id, name, quantity, unitPrice: 100 });
const venta = (id, eventId, tickets, extra = {}) => ({
  id,
  eventId,
  firstName: id,
  lastName: "",
  email: `${id}@x.com`,
  quantity: tickets.reduce((a, t) => a + t.quantity, 0) || 1,
  value: 100,
  tickets,
  status: "pending",
  origin: "manual",
  createdAt: "2026-11-01T00:00:00Z",
  ...extra,
});

const ventas = [
  venta("a", "colonia", [linea("gen", "General", 2), linea("vip", "VIP", 1)], { receiptPath: "x.jpg" }),
  venta("b", "colonia", [linea("vip", "VIP", 2)], { origin: "web" }),
  venta("c", "colonia", [linea("gen", "General", 4)]),
  venta("d", "colonia", [], { quantity: 3 }),
  venta("e", "paysandu", [linea("gen", "General", 1)]),
  venta("f", "vieja", [linea("gen", "General", 1)]),
];
const eventos = [
  { id: "colonia", name: "Navidad Colonia", date: "2099-12-24" },
  { id: "paysandu", name: "Navidad Paysandú", date: "2099-12-20" },
  { id: "vieja", name: "Halloween", date: "2020-10-31" },
];

const ids = (f) => ventas.filter((d) => pasaFiltros(d, { ...FILTROS_INICIALES, ...f })).map((d) => d.id).join("");

check("sin filtros pasan todas", ids({}) === "abcdef", ids({}));
check("por evento", ids({ evento: "colonia" }) === "abcd", ids({ evento: "colonia" }));
check("VIP en Colonia", ids({ evento: "colonia", tipo: "vip" }) === "ab", ids({ evento: "colonia", tipo: "vip" }));
check("General en Colonia", ids({ evento: "colonia", tipo: "gen" }) === "ac");
check("sin tipo cargado", ids({ evento: "colonia", tipo: SIN_DESGLOSE }) === "d");
check("con comprobante", ids({ comprobante: "con" }) === "a");
check("sin comprobante", ids({ evento: "colonia", comprobante: "sin" }) === "bcd");
check("pedidos de la web", ids({ origen: "web" }) === "b");
check("cargadas a mano + VIP", ids({ origen: "manual", tipo: "vip" }) === "a");

check("con VIP elegido, una venta 2 Gen + 1 VIP cuenta 1", entradasQueCuentan(ventas[0], { tipo: "vip", precio: TODOS }) === 1);
check("sin tipo elegido cuenta todo", entradasQueCuentan(ventas[0], { tipo: TODOS, precio: TODOS }) === 3);

const porTipo = entradasPorTipo(ventas.slice(0, 4));
check(
  "resumen por tipo",
  JSON.stringify(porTipo) ===
    JSON.stringify([
      { nombre: "General", cantidad: 6 },
      { nombre: "VIP", cantidad: 3 },
      { nombre: "Sin tipo", cantidad: 3 },
    ]),
  porTipo
);

const tipos = opcionesTipos(ventas.slice(0, 4));
check(
  "botones de tipo con cuántas ventas",
  tipos.map((t) => `${t.nombre}:${t.ventas}`).join(",") === "General:2,VIP:2,Sin tipo:1",
  tipos
);

const ops = opcionesEventos(ventas, eventos);
check("eventos: próximos por fecha y después los pasados", ops.map((o) => o.id).join(",") === "paysandu,colonia,vieja", ops);
check("pasado marcado", ops.find((o) => o.id === "vieja").pasado === true);
check("abre en el próximo", eventoPorDefecto(ops) === "paysandu");
check("sin ventas abre en todos", eventoPorDefecto([]) === TODOS);
const borrado = opcionesEventos([venta("z", "borrado", [])], eventos);
check("evento borrado va con los pasados", borrado[0].nombre === "Evento eliminado" && borrado[0].pasado);

// ─── Precio, promo, fecha y orden ───
const l2 = (id, name, quantity, unitPrice, promoId) => ({ ticketTypeId: id, name, quantity, unitPrice, promoId });
const AHORA = new Date(2026, 10, 11, 15, 0); // 11/11/2026 15:00, hora local
const hace = (dias, hora = 12) => new Date(2026, 10, 11 - dias, hora, 0).toISOString();
const lotes = [
  venta("p1", "colonia", [l2("gen", "General", 2, 800)], { value: 1600, createdAt: hace(0, 9), firstName: "Zoe" }),
  venta("p2", "colonia", [l2("gen", "General", 1, 900)], { value: 900, createdAt: hace(1), firstName: "ana" }),
  venta("p3", "colonia", [l2("gen", "General", 2, 800, "promo1"), l2("vip", "VIP", 1, 1500)], { value: 2300, createdAt: hace(3), firstName: "Beto" }),
  venta("p4", "colonia", [l2("vip", "VIP", 1, 800)], { value: 800, createdAt: hace(8), firstName: "Ávila" }),
  venta("p5", "colonia", [], { quantity: 2, value: 1600, createdAt: hace(6), firstName: "Caro" }),
];
const idsL = (f, orden) => {
  const filtros = { ...FILTROS_INICIALES, ...f };
  return ordenar(lotes.filter((d) => pasaFiltros(d, filtros, undefined, AHORA)), orden ?? "nombre").map((d) => d.id).join(",");
};
const igual = (nombre, real, esperado) => check(nombre, real === esperado, real);

igual("precio $800: las que tienen alguna entrada a 800 (y la sin desglose a 800 de promedio)", idsL({ precio: "800" }), "p4,p3,p5,p1");
igual("precio $900", idsL({ precio: "900" }), "p2");
igual("tipo y precio se miran en la MISMA entrada: General de $800", idsL({ tipo: "gen", precio: "800" }), "p3,p1");
igual("VIP de $800 no trae la venta con General a 800 y VIP a 1500", idsL({ tipo: "vip", precio: "800" }), "p4");
check("con precio elegido cuentan sólo esas entradas", entradasQueCuentan(lotes[2], { tipo: TODOS, precio: "800" }) === 2);
check("con tipo y precio, las de esa combinación", entradasQueCuentan(lotes[2], { tipo: "vip", precio: "1500" }) === 1);

const precios = opcionesPrecios(lotes);
igual("botones de precio, de menor a mayor, con cuántas ventas", precios.map((p) => p.precio + ":" + p.ventas).join(","), "800:4,900:1,1500:1");
igual("con un tipo elegido, sólo los precios de ese tipo", opcionesPrecios(lotes, "gen").map((p) => p.id).join(","), "800,900");

igual("con promo", idsL({ promo: "con" }), "p3");
igual("sin promo (la sin desglose también)", idsL({ promo: "sin" }), "p2,p4,p5,p1");

igual("hoy", idsL({ fecha: "hoy" }), "p1");
igual("ayer", idsL({ fecha: "ayer" }), "p2");
igual("últimos 7 días (hoy incluido, el de hace 8 no)", idsL({ fecha: "semana" }), "p2,p3,p5,p1");

igual("orden: más nuevas primero", idsL({}, "nuevas"), "p1,p2,p3,p5,p4");
igual("orden: las que más esperan", idsL({}, "espera"), "p4,p5,p3,p2,p1");
igual("orden: mayor monto (empate: la más nueva)", idsL({}, "monto"), "p3,p1,p5,p2,p4");
igual("orden: por nombre, sin importar tildes ni mayúsculas", idsL({}, "nombre"), "p2,p4,p3,p5,p1");
check("ordenar no toca la lista original", lotes[0].id === "p1");

const puesto = { ...FILTROS_INICIALES, evento: "colonia", precio: "800", promo: "con", fecha: "hoy", orden: "monto" };
const limpio = limpiarFiltros(puesto);
check("limpiar saca los filtros y deja evento y orden", limpio.evento === "colonia" && limpio.orden === "monto" && !hayFiltrosExtra(limpio), limpio);
check("el orden solo no cuenta como filtro puesto", !hayFiltrosExtra({ ...FILTROS_INICIALES, orden: "nombre" }));
check("número del botón de celular: desplegables puestos", filtrosEnDesplegables(puesto) === 3, filtrosEnDesplegables(puesto));

console.log(fallas ? `\n${fallas} falla(s)` : "\nTodo bien");
process.exit(fallas ? 1 : 0);
