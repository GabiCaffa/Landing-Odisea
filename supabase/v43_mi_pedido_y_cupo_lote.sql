-- ════════════════════════════════════════════════════════════════════════════
-- v43 — "Mi pedido" para el cliente y stock automático por lote
-- ════════════════════════════════════════════════════════════════════════════
--
-- ─── 1) Mi pedido ───────────────────────────────────────────────────────────
-- El cliente entra a /pedido/K7Q2XM (el número va en su mensaje de WhatsApp)
-- y ve en qué está: por confirmar, pago confirmado o entradas enviadas. Corta
-- el "¿te llegó mi transferencia?" que tapaba el WhatsApp en plena venta.
--
-- Lo lee `anon`, así que va por una función que devuelve SÓLO lo que el
-- cliente necesita ver: estado, evento, cantidad, total y el primer nombre.
-- Nada de email, teléfono ni documento: el número del pedido no es una
-- contraseña, y quien lo adivine no tiene que poder ver datos de nadie.
--
-- ─── 2) Cupo por lote ───────────────────────────────────────────────────────
-- "Quedan N entradas antes del cambio de lote" (v29) era un número que el staff
-- tipeaba a mano. Ahora se carga el CUPO del lote (cuántas tiene en total) y lo
-- que queda se cuenta solo con las ventas CONFIRMADAS de ese tipo de entrada
-- en ese evento (por enviar + enviadas, igual que los cupos de promo de v40).
-- Un pedido sin confirmar no gasta cupo: si gastara, alguien agotaría un lote
-- tocando "Enviar" sin pagar.
--
-- Cuenta las ventas que tienen el tipo de entrada cargado (`delivery_ticket_types`,
-- v18). Las que se cargan desde la web o con Cargar ventas lo tienen; una venta
-- cargada a mano sin el desglose no descuenta.
--
-- Idempotente. Pegar en el SQL Editor de Supabase.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Mi pedido
create or replace function public.estado_pedido(p_code text)
returns table (
  codigo       text,
  estado       text,
  evento       text,
  fecha        date,
  lugar        text,
  slug         text,
  cantidad     integer,
  total        numeric,
  nombre       text,
  detalle      text,
  creado       timestamptz,
  confirmado   timestamptz,
  enviado      timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select d.order_code,
         d.status,
         e.name,
         e.date::date,
         e.location,
         e.slug,
         d.quantity,
         d.value,
         split_part(trim(d.first_name), ' ', 1),
         (select string_agg(dtt.quantity || ' ' || tt.name, ' · ' order by tt.name)
            from public.delivery_ticket_types dtt
            join public.ticket_types tt on tt.id = dtt.ticket_type_id
           where dtt.delivery_id = d.id),
         d.created_at,
         d.confirmed_at,
         d.sent_at
    from public.ticket_deliveries d
    join public.events e on e.id = d.event_id
   where d.order_code = upper(trim(p_code))
     and upper(trim(p_code)) ~ '^[A-HJKMNP-Z2-9]{6}$';
$$;

revoke all on function public.estado_pedido(text) from public;
grant execute on function public.estado_pedido(text) to anon, authenticated;

-- 2) Cupo por lote
alter table public.event_ticket_types
  add column if not exists lote_cupo integer;

alter table public.event_ticket_types drop constraint if exists event_ticket_types_lote_cupo_check;
alter table public.event_ticket_types
  add constraint event_ticket_types_lote_cupo_check check (lote_cupo is null or lote_cupo >= 0);

comment on column public.event_ticket_types.lote_cupo is
  'v43: cuántas entradas tiene este lote. Lo que queda se cuenta solo con las ventas confirmadas. NULL = sin cupo automático.';

-- Lo que queda de cada lote con cupo. Sólo el número: nada de quién compró.
create or replace function public.stock_lotes()
returns table (event_id uuid, ticket_type_id uuid, cupo integer, quedan integer)
language sql
stable
security definer
set search_path = public
as $$
  select ett.event_id,
         ett.ticket_type_id,
         ett.lote_cupo,
         greatest(
           ett.lote_cupo - coalesce((
             select sum(dtt.quantity)
               from public.delivery_ticket_types dtt
               join public.ticket_deliveries d on d.id = dtt.delivery_id
              where d.event_id = ett.event_id
                and dtt.ticket_type_id = ett.ticket_type_id
                and d.status in ('pending', 'sent')
           ), 0),
           0
         )::integer
    from public.event_ticket_types ett
   where ett.lote_cupo is not null;
$$;

grant execute on function public.stock_lotes() to anon, authenticated;

-- Verificación:
--   select * from public.stock_lotes();
--   select * from public.estado_pedido('XXXXXX');   -- con un número real
