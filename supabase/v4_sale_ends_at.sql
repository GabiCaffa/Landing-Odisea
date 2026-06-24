-- ════════════════════════════════════════════════════════════════════════════
-- ODÍSEA · v4 · Cierre automático de venta por fecha/hora
-- ════════════════════════════════════════════════════════════════════════════
-- Pegar y ejecutar en: Supabase Dashboard → SQL Editor → New query.
-- Idempotente: se puede ejecutar varias veces sin romper nada.
--
-- Agrega la columna sale_ends_at. Cuando un evento tiene este valor seteado,
-- la web cierra la venta sola al pasar ese momento (el card pasa a "Agotado"
-- y se deshabilita el botón de compra), sin tocar el estado manual.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.events add column if not exists sale_ends_at timestamptz;
