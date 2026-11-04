import type { TicketDelivery } from "@/lib/deliveries";
import type { PaymentAccount } from "@/lib/paymentAccounts";
import { formatPhoneDisplay } from "@/lib/validators";

/**
 * Exporta las ventas a un Excel con el formato de la planilla que el staff ya
 * usaba ("Odisea Venta …"): una hoja por evento, el encabezado naranja, las
 * filas ENVIADAS en verde y, al costado, el total y la cuenta por precio. Así
 * el archivo se lee igual que la planilla de siempre y no hay que aprender
 * nada nuevo.
 *
 * Primero va una hoja "Resumen" con las mismas cinco columnas que la de la
 * planilla (fiesta, slug, capacidad, vendidas, quedan) más la plata.
 *
 * **Sólo ventas confirmadas** (Por enviar y Enviadas). Un pedido de la web sin
 * confirmar no es una venta (v40) y no tiene por qué estar en la planilla.
 *
 * `exceljs` se carga recién al tocar el botón, en su propio chunk: pesa cerca
 * de 1 MB y sólo lo usa el staff (ver `manualChunks` en vite.config.ts).
 */

export interface EventoParaExcel {
  id: string;
  name: string;
  /** ISO "2026-12-24". */
  date: string;
  slug?: string;
  capacity?: number;
  paymentAccountId?: string;
}

// Los colores son los de la planilla original.
const NARANJA = "FFFF9900";
const VERDE_ENVIADA = "FFD9EAD3";
const FUENTE = "Arial";
const PLATA = '"$"#,##0';

/** Encabezados de la hoja de cada evento, tal cual la plantilla "Navidad". */
const COLUMNAS = [
  { header: "Precio total", width: 14 },
  { header: "Nombre del comprador", width: 28 },
  { header: "PRECIO UNITARIO", width: 18 },
  { header: "Teléfono", width: 18 },
  { header: "Mail", width: 36 },
  { header: "Tipo de entrada", width: 24 },
  { header: "Cantidad", width: 11 },
  { header: "Confirmacion", width: 14 },
  { header: "Cuenta", width: 22 },
  { header: "", width: 4 },
  { header: "Enviada", width: 11 },
];

/** Excel no acepta estos caracteres en el nombre de una hoja, y corta en 31. */
const nombreHoja = (texto: string) => texto.replace(/[[\]:*?/\\]/g, "-").trim().slice(0, 31) || "Evento";

const ddmm = (iso: string) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}` : "");

/** "+598 99 111 222" → "598 99 111 222", como en la planilla. */
const telefono = (e164?: string) => (e164 ? formatPhoneDisplay(e164).replace(/^\+/, "") : "");

const tipoDeEntrada = (d: TicketDelivery) => {
  if (d.tickets.length === 1) return d.tickets[0].name;
  return d.tickets.map((l) => `${l.quantity} ${l.name}`).join(" · ");
};

/** Descarga la planilla. Lo que arma el archivo está en `armarExcelVentas`. */
export async function exportarVentasExcel(
  ventas: TicketDelivery[],
  eventos: EventoParaExcel[],
  cuentas: PaymentAccount[]
): Promise<{ hojas: number; filas: number }> {
  const { buffer, hojas, filas } = await armarExcelVentas(ventas, eventos, cuentas);
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const hoy = new Date();
  const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
  a.download = `odisea-ventas-${fecha}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { hojas, filas };
}

/**
 * Arma el libro y devuelve los bytes. Separado de la descarga para poder
 * probarlo con node (`scripts/probar-excel-ventas.mjs`).
 */
export async function armarExcelVentas(
  ventas: TicketDelivery[],
  eventos: EventoParaExcel[],
  cuentas: PaymentAccount[]
): Promise<{ buffer: ArrayBuffer; hojas: number; filas: number }> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "ODÍSEA";
  wb.created = new Date();
  // Que Excel recalcule las fórmulas al abrir, por si se agregan filas a mano.
  wb.calcProperties.fullCalcOnLoad = true;

  const confirmadas = ventas.filter((d) => d.status === "pending" || d.status === "sent");
  const porEvento = new Map<string, TicketDelivery[]>();
  for (const d of confirmadas) {
    const lista = porEvento.get(d.eventId) ?? [];
    lista.push(d);
    porEvento.set(d.eventId, lista);
  }

  const eventosConVentas = [...porEvento.keys()]
    .map((id) => eventos.find((e) => e.id === id) ?? { id, name: "Evento eliminado", date: "" })
    .sort((a, b) => a.date.localeCompare(b.date));

  // La hoja "Resumen" va primero, pero sus fórmulas apuntan a las hojas de
  // cada evento: se crea ahora y se llena al final.
  const resumen = wb.addWorksheet("Resumen", { views: [{ state: "frozen", ySplit: 1 }] });

  const usados = new Set<string>(["Resumen"]);
  const filasResumen: { evento: EventoParaExcel; hoja: string; ultima: number; vendidas: number; total: number; enviadas: number }[] = [];

  for (const evento of eventosConVentas) {
    let hoja = nombreHoja(evento.name);
    // Dos fechas con el mismo nombre (pasa: dos fiestas el mismo día en
    // ciudades distintas) no pueden compartir hoja.
    if (usados.has(hoja)) hoja = nombreHoja(`${evento.name.slice(0, 24)} ${ddmm(evento.date)}`);
    for (let i = 2; usados.has(hoja); i++) hoja = nombreHoja(`${evento.name.slice(0, 26)} ${i}`);
    usados.add(hoja);

    const ws = wb.addWorksheet(hoja, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = COLUMNAS.map((c) => ({ width: c.width }));

    const head = ws.getRow(1);
    COLUMNAS.forEach((c, i) => {
      const cell = head.getCell(i + 1);
      cell.value = c.header;
      cell.font = { name: FUENTE, size: 11, bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NARANJA } };
    });

    const cuenta = cuentas.find((a) => a.id === evento.paymentAccountId)?.holderName ?? "";
    const filas = (porEvento.get(evento.id) ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    filas.forEach((d, i) => {
      const n = i + 2;
      const enviada = d.status === "sent";
      const row = ws.getRow(n);
      row.values = [
        d.value,
        `${d.firstName} ${d.lastName}`.trim(),
        // Igual que la planilla: el unitario es el total sobre la cantidad.
        { formula: `IF(G${n}=0,"",A${n}/G${n})`, result: d.quantity ? d.value / d.quantity : "" },
        telefono(d.phone),
        d.email,
        tipoDeEntrada(d),
        d.quantity,
        "Sí",
        cuenta,
        "",
        enviada ? "Sí" : "",
      ];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        if (col > COLUMNAS.length) return;
        cell.font = { name: FUENTE, size: 10 };
        if (enviada) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE_ENVIADA } };
      });
      row.getCell(1).numFmt = PLATA;
      row.getCell(3).numFmt = PLATA;
    });

    const ultima = Math.max(filas.length + 1, 2);
    ws.autoFilter = { from: "A1", to: `K${ultima}` };

    // Al costado, como en la planilla: el total y la cuenta por precio.
    const total = filas.reduce((a, d) => a + d.value, 0);
    const entradas = filas.reduce((a, d) => a + d.quantity, 0);
    const enviadas = filas.filter((d) => d.status === "sent").reduce((a, d) => a + d.quantity, 0);
    ws.getColumn(13).width = 20;
    ws.getColumn(14).width = 18;
    const lado: [string, ExcelJSValor, string?][] = [
      ["TOTAL VENTA", { formula: `SUM(A2:A${ultima})`, result: total }, PLATA],
      ["ENTRADAS", { formula: `SUM(G2:G${ultima})`, result: entradas }],
      ["ENVIADAS", { formula: `SUMIF(K2:K${ultima},"Sí",G2:G${ultima})`, result: enviadas }],
      ["POR ENVIAR", { formula: `N2-N3`, result: entradas - enviadas }],
    ];
    lado.forEach(([etiqueta, valor, fmt], i) => {
      const l = ws.getCell(i + 1, 13);
      l.value = etiqueta;
      l.font = { name: FUENTE, size: 11, bold: true };
      l.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NARANJA } };
      const v = ws.getCell(i + 1, 14);
      v.value = valor;
      v.font = { name: FUENTE, size: 11, bold: true };
      if (fmt) v.numFmt = fmt;
    });

    // Cuántas entradas se vendieron a cada precio: lo que la planilla hacía
    // con SUMIF a mano para saber cuántas salieron en cada lote.
    const precios = [...new Set(filas.filter((d) => d.quantity > 0).map((d) => d.value / d.quantity))].sort((a, b) => a - b);
    if (precios.length) {
      const fila0 = 6;
      for (const [col, texto] of [[13, "Precio"], [14, "Cantidad de Ticket"]] as const) {
        const c = ws.getCell(fila0, col);
        c.value = texto;
        c.font = { name: FUENTE, size: 11, bold: true };
      }
      precios.forEach((p, i) => {
        const r = fila0 + 1 + i;
        const c1 = ws.getCell(r, 13);
        c1.value = p;
        c1.numFmt = PLATA;
        c1.font = { name: FUENTE, size: 10 };
        const c2 = ws.getCell(r, 14);
        c2.value = {
          formula: `SUMIF(C2:C${ultima},M${r},G2:G${ultima})`,
          result: filas.filter((d) => d.quantity && d.value / d.quantity === p).reduce((a, d) => a + d.quantity, 0),
        };
        c2.font = { name: FUENTE, size: 10 };
      });
    }

    filasResumen.push({ evento, hoja, ultima, vendidas: entradas, total, enviadas });
  }

  // Resumen: las mismas cinco columnas que la planilla, y después la plata.
  const cols = [
    { header: "fiesta", width: 32 },
    { header: "slug", width: 30 },
    { header: "capacidad", width: 12 },
    { header: "vendidas", width: 12 },
    { header: "quedan", width: 12 },
    { header: "enviadas", width: 12 },
    { header: "por enviar", width: 12 },
    { header: "recaudado", width: 16 },
  ];
  resumen.columns = cols.map((c) => ({ width: c.width }));
  cols.forEach((c, i) => {
    const cell = resumen.getCell(1, i + 1);
    cell.value = c.header;
    cell.font = { name: FUENTE, size: 11, bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NARANJA } };
  });
  filasResumen.forEach(({ evento, hoja, ultima, vendidas, total, enviadas }, i) => {
    const n = i + 2;
    const ref = `'${hoja.replace(/'/g, "''")}'`;
    const capacidad = evento.capacity && evento.capacity > 0 ? evento.capacity : null;
    resumen.getRow(n).values = [
      evento.name,
      evento.slug ?? "",
      capacidad,
      { formula: `SUM(${ref}!G2:G${ultima})`, result: vendidas },
      { formula: `IF(C${n}="","",MAX(0,C${n}-D${n}))`, result: capacidad ? Math.max(0, capacidad - vendidas) : "" },
      { formula: `SUMIF(${ref}!K2:K${ultima},"Sí",${ref}!G2:G${ultima})`, result: enviadas },
      { formula: `D${n}-F${n}`, result: vendidas - enviadas },
      { formula: `SUM(${ref}!A2:A${ultima})`, result: total },
    ];
    resumen.getRow(n).eachCell((c) => (c.font = { name: FUENTE, size: 10 }));
    resumen.getCell(n, 8).numFmt = PLATA;
  });

  const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  return { buffer, hojas: filasResumen.length, filas: confirmadas.length };
}

type ExcelJSValor = { formula: string; result: number | string };
