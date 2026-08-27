-- ════════════════════════════════════════════════════════════════════════════
-- ODÍSEA · v18 · Qué tipo de entrada compró cada uno
-- ════════════════════════════════════════════════════════════════════════════
-- `ticket_deliveries` (v9) guarda `quantity` y `value`: cuántas entradas y
-- cuánto pagó. Nunca guardó CUÁL entrada, porque cuando se hizo el módulo el
-- evento tenía un precio único. Desde v15 los tipos son una tabla, el sitio
-- vende varios por evento y el comprador puede armar un carrito mezclado
-- (2 General + 1 VIP), así que el dato existía y se perdía: el importador de
-- mensajes de WhatsApp lo tenía que escribir en Notas como texto suelto.
--
-- La planilla que el staff llevaba a mano SÍ tenía la columna "Tipo de entrada".
-- Esta migración la trae a la base, para poder responder "cuántas VIP vendí en
-- Colonia 19/9" — que hoy no se puede ni con la planilla.
--
-- Decisiones:
--   · Tabla hija y no una columna `ticket_type_id` en ticket_deliveries: una
--     compra puede tener más de un tipo, que es justo lo que arma el modal del
--     sitio y lo que viaja en el mensaje de WhatsApp.
--   · Apunta al CATÁLOGO (ticket_types), no a event_ticket_types. Guardar el
--     precio del evento sería más "correcto", pero `saveEventTickets` BORRA las
--     filas de event_ticket_types que el evento deja de vender: con una FK ahí,
--     editar la lista de entradas de un evento fallaría por las ventas viejas.
--   · `unit_price` es una FOTO de lo que se cobró, no un espejo del precio de
--     hoy (mismo criterio que v13 con las cuentas de cobro): el precio del tipo
--     cambia entre fechas y lo que se pagó no se reescribe.
--   · `quantity` y `value` de la entrega siguen siendo la verdad. NO se derivan
--     del desglose: hay entregas viejas sin desglose, y el staff puede cobrar un
--     total distinto a la suma (promo, redondeo, cortesía). El form mantiene los
--     dos sincronizados mientras se carga, y avisa si no coinciden.
--
-- Pegar en: Supabase Dashboard → SQL Editor → New query. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.delivery_ticket_types (
  id             uuid primary key default gen_random_uuid(),
  -- El desglose es detalle de la entrega, no historia aparte: si se borra la
  -- entrega, se va con ella.
  delivery_id    uuid not null references public.ticket_deliveries(id) on delete cascade,
  -- restrict: un tipo del catálogo con ventas cargadas no se puede borrar (se
  -- desactiva), igual que las cuentas de cobro de v13.
  ticket_type_id uuid not null references public.ticket_types(id) on delete restrict,
  quantity       integer not null check (quantity > 0),
  unit_price     numeric(10, 2) not null default 0 check (unit_price >= 0),
  created_at     timestamptz not null default now(),
  unique (delivery_id, ticket_type_id)
);

create index if not exists delivery_ticket_types_delivery_idx
  on public.delivery_ticket_types (delivery_id);

create index if not exists delivery_ticket_types_type_idx
  on public.delivery_ticket_types (ticket_type_id);

-- ─── RLS: sólo staff, igual que la entrega de la que depende ─────────────────
alter table public.delivery_ticket_types enable row level security;

drop policy if exists "delivery_ticket_types_all_staff" on public.delivery_ticket_types;

-- Una sola política para todo: el desglose no tiene lectura pública (a nadie de
-- afuera le importa qué compró otro), y is_staff() (v11) deja pasar al operador,
-- que es quien carga las entregas.
create policy "delivery_ticket_types_all_staff" on public.delivery_ticket_types
  for all using (public.is_staff()) with check (public.is_staff());

-- ════════════════════════════════════════════════════════════════════════════
-- DESPUÉS de ejecutar esto:
--   · En el form de entrega se cargan las cantidades por tipo de entrada, y
--     la cantidad y el total se calculan solos (editables).
--   · El importador de mensajes de WhatsApp cruza los tipos del mensaje con el
--     catálogo y carga el desglose en vez de dejarlo en Notas.
--   · El CSV de Entregas suma una columna "Tipo de entrada".
--
-- Las entregas viejas quedan sin desglose: se ven como "sin detalle" y se les
-- puede cargar editándolas. No se inventa nada retroactivo.
-- ════════════════════════════════════════════════════════════════════════════
