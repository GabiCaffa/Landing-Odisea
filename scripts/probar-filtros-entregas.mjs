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

check("con VIP elegido, una venta 2 Gen + 1 VIP cuenta 1", entradasQueCuentan(ventas[0], "vip") === 1);
check("sin tipo elegido cuenta todo", entradasQueCuentan(ventas[0], TODOS) === 3);

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

console.log(fallas ? `\n${fallas} falla(s)` : "\nTodo bien");
process.exit(fallas ? 1 : 0);
