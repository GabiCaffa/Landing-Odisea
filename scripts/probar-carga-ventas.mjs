/**
 * Prueba de "Cargar ventas" (v35): separar varios mensajes pegados juntos y
 * los avisos de duplicado. Para correrla:
 *
 *   npx esbuild scripts/carga-ventas.entry.ts --bundle --format=esm --platform=node \
 *     --outfile=scripts/cargaVentas.bundle.mjs
 *   node scripts/probar-carga-ventas.mjs
 *   rm scripts/cargaVentas.bundle.mjs
 *
 * Hace falta el bundle porque los archivos son TypeScript (mismo molde que
 * probar-paginas-evento.mjs).
 */
import {
  buildPurchaseMessage,
  parsePurchaseMessage,
  splitPurchaseMessages,
  revisarDuplicados,
  revisarPrecios,
  revisarEvento,
  buildConfirmacionVenta,
  whatsappUrl,
} from "./cargaVentas.bundle.mjs";

let fallas = 0;
const check = (nombre, ok, detalle = "") => {
  console.log(`${ok ? "ok " : "MAL"}  ${nombre}${ok ? "" : `  →  ${detalle}`}`);
  if (!ok) fallas++;
};

// ─── Mensajes como los arma el sitio ────────────────────────────────────────
const mensaje = (nombre, email, tel, qty, precio) =>
  buildPurchaseMessage({
    fullName: nombre,
    email,
    phoneE164: tel,
    eventName: "HALLOWEEN COLONIA",
    eventDate: "31 de octubre",
    items: [{ name: "General", qty, price: precio }],
    total: qty * precio,
    account: null,
  });

const m1 = mensaje("Juan Pérez", "juan@mail.com", "+59899111222", 2, 700);
const m2 = mensaje("Ana Gómez", "ana@mail.com", "+59899333444", 1, 700);
const m3 = mensaje("Luis Díaz", "luis@mail.com", "+59899555666", 3, 700);

// Un mensaje suelto: una sola venta, igual que antes.
{
  const partes = splitPurchaseMessages(m1);
  check("un mensaje suelto → 1 venta", partes.length === 1, partes.length);
  check("…y se entiende entero", parsePurchaseMessage(partes[0]).usable);
}

// Tres pegados uno atrás del otro, sin sellos.
{
  const partes = splitPurchaseMessages([m1, m2, m3].join("\n"));
  check("tres mensajes pegados → 3 ventas", partes.length === 3, partes.length);
  const emails = partes.map((p) => parsePurchaseMessage(p).data.email);
  check(
    "…cada una con su email",
    emails.join(",") === "juan@mail.com,ana@mail.com,luis@mail.com",
    emails.join(",")
  );
}

// Copiado desde WhatsApp Web: sello con HORA primero en la primera línea de
// cada mensaje, y una respuesta del staff en el medio.
{
  const sello = (hora, quien, texto) => {
    const [primera, ...resto] = texto.split("\n");
    return [`[${hora}, 19/10/2026] ${quien}: ${primera}`, ...resto].join("\n");
  };
  const chat = [
    sello("21:03", "Juan Pérez", m1),
    "[21:05, 19/10/2026] ODISEA: Perfecto, ya te anotamos!",
    sello("21:10", "+598 99 333 444", m2),
  ].join("\n");
  const partes = splitPurchaseMessages(chat);
  check("WhatsApp Web (hora primero) → 2 ventas", partes.length === 2, partes.length);
  const p1 = parsePurchaseMessage(partes[0]);
  check("…la primera se entiende entera", p1.usable, JSON.stringify(p1.warnings));
  check("…el nombre no se come el sello", p1.data.fullName === "Juan Pérez", p1.data.fullName);
  check("…el evento sale del mensaje", p1.data.eventName === "HALLOWEEN COLONIA", p1.data.eventName);
  check("…la respuesta del staff no ensucia el total", p1.data.total === 1400, p1.data.total);
  const p2 = parsePurchaseMessage(partes[1]);
  check("…la segunda también", p2.usable && p2.data.email === "ana@mail.com", p2.data.email);
}

// El chat exportado del teléfono: fecha primero (lo que ya se soportaba).
{
  const chat = m1
    .split("\n")
    .map((l, i) => (i === 0 ? `19/10/26, 21:03 - Juan Pérez: ${l}` : l))
    .join("\n");
  const p = parsePurchaseMessage(splitPurchaseMessages(chat)[0]);
  check("chat exportado (fecha primero) sigue andando", p.usable && p.data.fullName === "Juan Pérez");
}

// El mismo mensaje seleccionado dos veces queda uno solo.
{
  const partes = splitPurchaseMessages([m1, m2, m1].join("\n"));
  check("mensaje repetido en el pegado → no se duplica", partes.length === 2, partes.length);
}

// ─── Duplicados ─────────────────────────────────────────────────────────────
const ahora = new Date("2026-10-19T21:00:00-03:00");
const venta = (over) => ({
  id: "d1",
  eventId: "ev-colonia",
  firstName: "Juan",
  lastName: "Pérez",
  email: "juan@mail.com",
  phone: "+59899111222",
  quantity: 2,
  value: 1400,
  tickets: [],
  status: "pending",
  createdAt: "2026-10-19T12:00:00-03:00",
  ...over,
});
const candidata = (over) => ({
  eventId: "ev-colonia",
  email: "juan@mail.com",
  phone: "+59899111222",
  quantity: 2,
  value: 1400,
  ...over,
});

{
  const r = revisarDuplicados(candidata(), [venta()], { ahora });
  check("misma persona, misma compra, hoy → FUERTE", r.length === 1 && r[0].nivel === "fuerte", JSON.stringify(r));
}
{
  // El caso que pidió el autor: compra hoy y vuelve a comprar a la semana.
  const r = revisarDuplicados(candidata(), [venta({ createdAt: "2026-10-12T12:00:00-03:00" })], { ahora });
  check("misma compra pero hace una semana → sólo aviso", r.length === 1 && r[0].nivel === "aviso", JSON.stringify(r));
}
{
  const r = revisarDuplicados(candidata({ quantity: 4, value: 2800 }), [venta()], { ahora });
  check("misma persona, otra cantidad, hoy → sólo aviso", r.length === 1 && r[0].nivel === "aviso", JSON.stringify(r));
}
{
  const r = revisarDuplicados(candidata({ email: "otro@mail.com" }), [venta()], { ahora });
  check("mismo teléfono con otro email → se detecta", r.length === 1 && r[0].nivel === "fuerte", JSON.stringify(r));
}
{
  const r = revisarDuplicados(candidata({ eventId: "ev-paysandu" }), [venta()], { ahora });
  check("misma persona en OTRO evento → nada", r.length === 0, JSON.stringify(r));
}
{
  const r = revisarDuplicados(
    candidata({ email: "x@mail.com", phone: "+59899000000", eventId: "ev-paysandu", receiptHash: "abc" }),
    [venta({ receiptHash: "abc" })],
    { ahora, nombreEvento: () => "HALLOWEEN COLONIA" }
  );
  check(
    "mismo comprobante, otra persona y otro evento → FUERTE",
    r.length === 1 && r[0].nivel === "fuerte" && r[0].texto.includes("HALLOWEEN COLONIA"),
    JSON.stringify(r)
  );
}
{
  const r = revisarDuplicados(candidata({ receiptHash: "abc" }), [venta({ receiptHash: "abc" })], { ahora });
  check("mismo comprobante Y misma compra → un solo aviso, no dos", r.length === 1, JSON.stringify(r));
}
{
  const r = revisarDuplicados(candidata({ email: "ana@mail.com", phone: "+59899333444" }), [venta()], { ahora });
  check("otra persona → nada", r.length === 0, JSON.stringify(r));
}

// ─── Precio y evento ────────────────────────────────────────────────────────
{
  const lines = [{ ticketTypeId: "gen", name: "General", quantity: 2, unitPrice: 600 }];
  const r = revisarPrecios(lines, [{ ticketTypeId: "gen", price: 700 }]);
  check("precio distinto al de hoy → aviso", r.length === 1 && r[0].texto.includes("$600"), JSON.stringify(r));
  const conPromo = revisarPrecios([{ ...lines[0], promoId: "2x1" }], [{ ticketTypeId: "gen", price: 700 }]);
  check("…pero no si la línea tiene promo", conPromo.length === 0, JSON.stringify(conPromo));
  const igual = revisarPrecios([{ ...lines[0], unitPrice: 700 }], [{ ticketTypeId: "gen", price: 700 }]);
  check("…ni si coincide", igual.length === 0);
}
{
  check("evento que ya pasó → aviso", revisarEvento({ date: "2026-10-01", status: "activo" }, ahora).length === 1);
  check("evento finalizado → aviso", revisarEvento({ date: "2026-12-01", status: "finalizado" }, ahora).length === 1);
  check("evento de hoy → nada", revisarEvento({ date: "2026-10-19", status: "activo" }, ahora).length === 0);
}

// ─── Pedidos de la web (v36) ────────────────────────────────────────────────
{
  const conPedido = buildPurchaseMessage({
    fullName: "Juan Pérez",
    email: "juan@mail.com",
    phoneE164: "+59899111222",
    eventName: "NAVIDAD COLONIA",
    eventDate: "24 de diciembre",
    items: [{ name: "General", qty: 2, price: 700 }],
    total: 1400,
    account: null,
    orderCode: "K7Q2XM",
  });
  check("el mensaje lleva el número de pedido", conPedido.includes("Pedido: #K7Q2XM"));
  const p = parsePurchaseMessage(conPedido);
  check("…y el panel lo lee", p.data.orderCode === "K7Q2XM", p.data.orderCode);
  check("…sin romper el resto", p.usable && p.data.total === 1400 && p.data.quantity === 2);
  check("mensaje viejo sin número → null", parsePurchaseMessage(m1).data.orderCode === null);
  const pegado = parsePurchaseMessage(
    conPedido.split("\n").map((l) => `[21:03, 19/12/2026] Juan: ${l}`).join("\n")
  );
  check("…también copiado de WhatsApp Web", pegado.data.orderCode === "K7Q2XM", pegado.data.orderCode);
}
{
  const pedido = venta({ id: "p1", status: "por_confirmar", orderCode: "K7Q2XM" });
  const r = revisarDuplicados(candidata({ excluirId: "p1" }), [pedido], { ahora });
  check("confirmar un pedido no avisa que se repite con sí mismo", r.length === 0, JSON.stringify(r));
  const r2 = revisarDuplicados(candidata(), [pedido], { ahora });
  check(
    "sin número, un pedido abierto igual avisa (y dice que es un pedido)",
    r2.length === 1 && r2[0].nivel === "fuerte" && r2[0].texto.includes("pedido sin confirmar"),
    JSON.stringify(r2)
  );
}

// ─── Respuesta al cliente ───────────────────────────────────────────────────
{
  const texto = buildConfirmacionVenta({ nombre: "Juan Pérez", cantidad: 2, evento: "HALLOWEEN COLONIA", email: "juan@mail.com" });
  check("la respuesta usa sólo el primer nombre", texto.startsWith("Hola Juan!"), texto.split("\n")[0]);
  check("…y nombra el email", texto.includes("juan@mail.com"));
  check("…sin emojis", !/\p{Extended_Pictographic}/u.test(texto));
  const url = whatsappUrl("+598 99 111 222", texto);
  check("link de WhatsApp sin + ni espacios", url?.startsWith("https://wa.me/59899111222?text="), url);
  check("sin teléfono → sin link", whatsappUrl(null, texto) === null);
}

console.log(fallas ? `\n${fallas} falla(s)` : "\nTodo bien");
process.exit(fallas ? 1 : 0);
