// Punto de entrada para `probar-carga-ventas.mjs`: junta en un bundle las piezas
// puras de "Cargar ventas" (v39) para poder probarlas con node pelado.
export { parsePurchaseMessage, splitPurchaseMessages, buildPurchaseMessage } from "@/lib/purchaseMessage";
export {
  revisarDuplicados,
  revisarPrecios,
  revisarEvento,
  revisarMoneda,
  mismaPersona,
  cambiosDelPedido,
} from "@/lib/duplicadosVenta";
export { fmtPrecio, fmtSimple, fmtTotales, sumarPorMoneda, monedaDe } from "@/lib/moneda";
export { buildConfirmacionVenta, whatsappUrl } from "@/lib/ventaMessage";
