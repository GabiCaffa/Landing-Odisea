-- ════════════════════════════════════════════════════════════════════════════
-- v29 — Cuántas entradas quedan antes del cambio de lote
-- ════════════════════════════════════════════════════════════════════════════
--
-- Para vender con urgencia REAL: "Quedan 50 entradas antes del cambio de lote".
-- Un lote es un tipo de entrada con su precio (v15), así que el número vive
-- donde vive el precio: en `event_ticket_types`, una columna por (evento, tipo).
--
-- ─── Es un dato que carga el staff, y tiene que ser VERDADERO ───────────────
--
-- Se muestra tal cual al público. Si el número no coincide con lo que de verdad
-- queda, es urgencia inventada —publicidad engañosa—, así que hay que
-- mantenerlo al día cada vez que se cargan ventas. No hay un contador
-- automático: las ventas entran por WhatsApp y se cargan a mano en Entregas
-- (v9). Si algún día se quiere que baje solo, el camino es un trigger sobre
-- `delivery_ticket_types` (v18) que reste de esta columna.
--
-- NULL = sin límite informado: no se muestra nada. 0 no se muestra tampoco (un
-- lote sin entradas se desactiva con "A la venta", no con un cartel de cero).
--
-- No necesita políticas nuevas: lectura pública y escritura `is_manager()`
-- (v22) ya cubren cualquier columna de la tabla.
--
-- Idempotente. Pegar en el SQL Editor de Supabase.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.event_ticket_types
  add column if not exists stock_remaining integer
  check (stock_remaining is null or stock_remaining >= 0);

comment on column public.event_ticket_types.stock_remaining is
  'v29: entradas que quedan de este lote antes del cambio. NULL = no informado (no se muestra). Lo carga el staff a mano.';

-- ════════════════════════════════════════════════════════════════════════════
-- Verificación
-- ════════════════════════════════════════════════════════════════════════════
--
-- select e.name, tt.name as lote, ett.price, ett.active, ett.stock_remaining
--   from public.event_ticket_types ett
--   join public.events e on e.id = ett.event_id
--   join public.ticket_types tt on tt.id = ett.ticket_type_id
--  order by e.date, ett.sort_order;
-- ════════════════════════════════════════════════════════════════════════════
