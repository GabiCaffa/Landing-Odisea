-- ════════════════════════════════════════════════════════════════════════════
-- v28 — El ABONO: una entrada que vale para todos los días de la fiesta
-- ════════════════════════════════════════════════════════════════════════════
--
-- Las fiestas de varios días (v26) se venden por día: cada día es un evento y
-- cada compra es de un día. Falta lo que ofrece cualquier ticketera para una
-- fiesta así: **un pase para toda la fiesta**.
--
-- ─── Es una BANDERA en el catálogo, no una tabla ────────────────────────────
--
-- El abono no necesita estructura nueva: es un tipo de entrada más, con su
-- precio en `event_ticket_types` como todos. Lo único que le falta al modelo
-- es **saber que vale para todos los días**, y eso es un booleano.
--
-- Qué compra esa bandera, que si no habría que resolver por convención de
-- nombres (buscar "ABONO" en el nombre, que es exactamente la clase de regla
-- que se rompe el día que alguien lo escribe "Abono 3 días"):
--
-- 1. El comprador ve **"Vale para los 3 días"** al lado del precio, en vez de
--    tener que deducirlo del nombre.
-- 2. El formulario de fiesta lo ofrece en su propia sección y lo asigna a
--    todos los días de una.
-- 3. El panel puede distinguir una venta de abono de tres ventas sueltas.
--
-- ─── Se asigna a TODOS los días, no a uno ───────────────────────────────────
--
-- Se podría haber colgado del primer día y mostrarlo en los otros, pero eso
-- obliga a que cada página vaya a buscar entradas de OTRO evento, y rompe la
-- regla de que lo que se vende en una página sale de su propio evento. Puesto
-- en los tres, cada página lo ofrece con su propio `event_ticket_types` y el
-- camino de la compra no cambia en nada.
--
-- El costo: la venta queda registrada en el día desde el que se compró. Para
-- el staff no cambia nada —el mensaje de WhatsApp dice ABONO— y evita tocar
-- la parte del código por donde pasa la plata.
--
-- Idempotente. Pegar en el SQL Editor de Supabase.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.ticket_types
  add column if not exists is_abono boolean not null default false;

comment on column public.ticket_types.is_abono is
  'v28: true = vale para todos los días de la fiesta (pase completo), no para una fecha.';

-- Nada más: el precio sigue viviendo en `event_ticket_types` (v15) y las
-- políticas de `ticket_types` ya existen (lectura pública, escritura
-- `is_manager()` desde v22). Una columna nueva queda cubierta por ellas.

-- ════════════════════════════════════════════════════════════════════════════
-- Verificación
-- ════════════════════════════════════════════════════════════════════════════
--
-- select name, active, is_abono from public.ticket_types order by sort_order;
--
-- Para marcar uno que ya exista:
--   update public.ticket_types set is_abono = true where name = 'ABONO';
-- ════════════════════════════════════════════════════════════════════════════
