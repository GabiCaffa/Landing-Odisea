/**
 * Prueba del Excel de ventas (`src/lib/exportarVentasExcel.ts`).
 *
 *   npx esbuild src/lib/exportarVentasExcel.ts --bundle --format=esm --platform=node \
 *     --outfile=scripts/excelVentas.bundle.mjs --alias:@=./src --external:exceljs
 *   node scripts/probar-excel-ventas.mjs [salida.xlsx]
 *   (borrar el bundle después)
 *
 * Arma el libro con ventas inventadas, lo vuelve a leer y revisa lo que ve el
 * staff: hojas, encabezado, colores de las enviadas y totales.
 */
import { writeFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { armarExcelVentas } from "./excelVentas.bundle.mjs";

let fallas = 0;
const check = (nombre, ok, detalle = "") => {
  if (!ok) fallas++;
  console.log(`${ok ? "ok  " : "FALLA"} ${nombre}${!ok && detalle ? `  → ${detalle}` : ""}`);
};

const venta = (over) => ({
  id: Math.random().toString(36).slice(2),
  eventId: "nav",
  firstName: "Juan",
  lastName: "Prueba",
  email: "juan@ejemplo.com",
  phone: "+59899111222",
  quantity: 2,
  value: 1600,
  tickets: [{ ticketTypeId: "gen", name: "General", quantity: 2, unitPrice: 800 }],
  status: "pending",
  origin: "manual",
  createdAt: "2026-11-03T12:00:00-03:00",
  ...over,
});

const ventas = [
  venta({}),
  venta({ firstName: "Ana", status: "sent", quantity: 1, value: 800, tickets: [{ ticketTypeId: "gen", name: "General", quantity: 1, unitPrice: 800 }], createdAt: "2026-11-02T12:00:00-03:00" }),
  venta({ firstName: "Luis", status: "sent", quantity: 3, value: 3000, tickets: [
    { ticketTypeId: "gen", name: "General", quantity: 2, unitPrice: 800 },
    { ticketTypeId: "vip", name: "VIP", quantity: 1, unitPrice: 1400 },
  ] }),
  venta({ firstName: "Pedido", status: "por_confirmar", origin: "web", orderCode: "K7Q2XM" }),
  venta({ eventId: "hal", firstName: "Sofi", status: "sent", value: 1400, quantity: 2 }),
  venta({ eventId: "hal2", firstName: "Otra", status: "pending", value: 700, quantity: 1 }),
];
const eventos = [
  { id: "nav", name: "NAVIDAD COLONIA", date: "2026-12-24", slug: "navidad-colonia", capacity: 400, paymentAccountId: "acc" },
  { id: "hal", name: "HALLOWEEN COLONIA", date: "2026-10-31", slug: "halloween-colonia", capacity: 0, paymentAccountId: "acc" },
  { id: "hal2", name: "HALLOWEEN COLONIA", date: "2026-11-01", slug: "halloween-colonia-2", paymentAccountId: "otra" },
];
const cuentas = [{ id: "acc", holderName: "Gabi Caffarel" }];

const { buffer, hojas, filas } = await armarExcelVentas(ventas, eventos, cuentas);
check("3 eventos con ventas confirmadas → 3 hojas", hojas === 3, hojas);
check("el pedido sin confirmar no entra", filas === 5, filas);
if (process.argv[2]) writeFileSync(process.argv[2], Buffer.from(buffer));

const wb = new ExcelJS.Workbook();
await wb.xlsx.load(buffer);
const nombres = wb.worksheets.map((w) => w.name);
check("Resumen primero, después por fecha", nombres[0] === "Resumen" && nombres[1] === "HALLOWEEN COLONIA", nombres.join(" | "));
check("dos eventos con el mismo nombre no comparten hoja", new Set(nombres).size === nombres.length && nombres.some((n) => /HALLOWEEN COLONIA 01-11/.test(n)), nombres.join(" | "));

const nav = wb.getWorksheet("NAVIDAD COLONIA");
const head = nav.getRow(1).values.slice(1, 12);
check("encabezado como la plantilla", head.join("|") === "Precio total|Nombre del comprador|PRECIO UNITARIO|Teléfono|Mail|Tipo de entrada|Cantidad|Confirmacion|Cuenta||Enviada", head.join("|"));
check("encabezado naranja y en negrita", nav.getCell("B1").fill.fgColor.argb === "FFFF9900" && nav.getCell("B1").font.bold);
check("ordenadas por fecha de compra", nav.getCell("B2").value.startsWith("Ana"), nav.getCell("B2").value);
check("la enviada va en verde", nav.getCell("B2").fill?.fgColor?.argb === "FFD9EAD3");
const filaJuan = [2, 3, 4].find((r) => String(nav.getCell(`B${r}`).value).startsWith("Juan"));
check("la por enviar va sin color", !nav.getCell(`B${filaJuan}`).fill?.fgColor);
check("teléfono sin el +, como la planilla", nav.getCell(`D${filaJuan}`).value === "598 99 111 222", nav.getCell(`D${filaJuan}`).value);
check("cuenta del evento", nav.getCell(`I${filaJuan}`).value === "Gabi Caffarel");
check("precio unitario = total / cantidad", nav.getCell(`C${filaJuan}`).value.formula === `IF(G${filaJuan}=0,"",A${filaJuan}/G${filaJuan})` && nav.getCell(`C${filaJuan}`).value.result === 800);
const filaLuis = [2, 3, 4].find((r) => String(nav.getCell(`B${r}`).value).startsWith("Luis"));
check("carrito mezclado → desglose en Tipo de entrada", nav.getCell(`F${filaLuis}`).value === "2 General · 1 VIP", nav.getCell(`F${filaLuis}`).value);
check("total venta con fórmula y resultado", nav.getCell("N1").value.formula === "SUM(A2:A4)" && nav.getCell("N1").value.result === 5400, JSON.stringify(nav.getCell("N1").value));
check("enviadas: suma las cantidades de las verdes", nav.getCell("N3").value.result === 4, JSON.stringify(nav.getCell("N3").value));
check("formato de plata en el total", nav.getCell("A2").numFmt === '"$"#,##0');
check("encabezado fijo al bajar", nav.views[0]?.state === "frozen" && nav.views[0]?.ySplit === 1);

const res = wb.getWorksheet("Resumen");
const filaNav = [2, 3, 4].find((r) => res.getCell(`A${r}`).value === "NAVIDAD COLONIA");
check("resumen: vendidas suma la hoja", res.getCell(`D${filaNav}`).value.formula === "SUM('NAVIDAD COLONIA'!G2:G4)" && res.getCell(`D${filaNav}`).value.result === 6, JSON.stringify(res.getCell(`D${filaNav}`).value));
check("resumen: quedan = capacidad − vendidas", res.getCell(`E${filaNav}`).value.result === 394);
check("resumen: sin capacidad, quedan vacío", [undefined, ""].includes(res.getCell("E2").value.result) && res.getCell("C2").value === null, JSON.stringify(res.getCell("E2").value));
// exceljs no lee calcPr de vuelta: se mira el XML del libro.
const { default: JSZip } = await import("jszip");
const xml = await (await JSZip.loadAsync(buffer)).file("xl/workbook.xml").async("string");
check("al abrirlo, Excel recalcula todo", /<calcPr[^>]*fullCalcOnLoad="1"/.test(xml), xml.match(/<calcPr[^>]*>/)?.[0]);
check("resumen: recaudado", res.getCell(`H${filaNav}`).value.result === 5400);

console.log(fallas ? `\n${fallas} falla(s)` : "\nTodo bien");
process.exit(fallas ? 1 : 0);
