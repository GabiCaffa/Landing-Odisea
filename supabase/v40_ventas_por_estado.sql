-- ════════════════════════════════════════════════════════════════════════════
-- v40 — Las ventas pasan por estados, y el pedido de la web se registra solo
-- ════════════════════════════════════════════════════════════════════════════
--
--   por_confirmar → el cliente tocó "Enviar por WhatsApp" en la web. Todavía
--                   no pagó: es un PEDIDO, no una venta.
--   pending       → el staff vio el comprobante. "Pendiente de enviar".
--   sent          → se mandaron las entradas.
--   vencido       → un pedido sin comprobante a las 48 hs. Se puede recuperar.
--
-- `pending` y `sent` conservan su nombre y su significado de v9, así que las
-- ventas que ya estaban cargadas no cambian y el panel viejo sigue andando.
--
-- ─── Por qué el pedido entra por una función y no por la tabla ──────────────
-- El que compra puede no tener cuenta, así que esto lo llama `anon`. Abrirle
-- la tabla sería dejar que cualquiera lea o escriba ventas. La función
-- (security definer) sólo INSERTA, sólo con estado `por_confirmar`, y valida
-- contra la base lo que puede validar: que el evento esté a la venta, que cada
-- tipo de entrada lo venda ese evento AL PRECIO de lista de hoy, que la promo
-- esté asignada, y que el total no supere la suma de lista.
--
-- **Un pedido nunca es una venta.** No cuenta para la recaudación del panel ni
-- para los cupos de las promos (ver `promo_cupos_restantes` abajo), y sólo el
-- staff, con sesión, lo pasa a `pending`. Un mensaje o un comprobante solos no
-- lo confirman.
--
-- ─── El número de pedido ────────────────────────────────────────────────────
-- Lo genera el NAVEGADOR y viaja en el mensaje de WhatsApp ("Pedido: #K7Q2XM").
-- No lo genera la base porque abrir WhatsApp tiene que pasar en el mismo toque
-- del botón: si se esperara la respuesta, el celular bloquea la ventana nueva.
-- 6 caracteres sin los que se confunden (0/O, 1/I/L): ~600 millones de
-- combinaciones. Si el pedido no llegara a guardarse, el staff carga la venta
-- a mano como siempre: nada se rompe.
--
-- Mismo número dos veces = el mismo pedido. Si el cliente vuelve a tocar el
-- botón con otro carrito, se REEMPLAZA (mientras siga por confirmar).
--
-- Idempotente. Pegar en el SQL Editor de Supabase. Necesita v39 y pg_cron (v8).
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Estados
alter table public.ticket_deliveries drop constraint if exists ticket_deliveries_status_check;
alter table public.ticket_deliveries
  add constraint ticket_deliveries_status_check
  check (status in ('por_confirmar', 'pending', 'sent', 'vencido'));

-- 2) Columnas nuevas
alter table public.ticket_deliveries
  add column if not exists order_code   text,
  add column if not exists origin       text not null default 'manual',
  add column if not exists confirmed_at timestamptz;

alter table public.ticket_deliveries drop constraint if exists ticket_deliveries_origin_check;
alter table public.ticket_deliveries
  add constraint ticket_deliveries_origin_check check (origin in ('manual', 'web'));

create unique index if not exists deliveries_order_code_idx
  on public.ticket_deliveries(order_code)
  where order_code is not null;

comment on column public.ticket_deliveries.order_code is
  'v40: número de pedido de la web ("K7Q2XM"). Viaja en el mensaje de WhatsApp.';
comment on column public.ticket_deliveries.origin is
  'v40: web = lo registró el sitio al tocar Enviar; manual = lo cargó el staff.';
comment on column public.ticket_deliveries.confirmed_at is
  'v40: cuándo el staff pasó el pedido a pendiente de enviar (vio el comprobante).';

-- 3) Reglas de los cambios de estado
--    · No se envía lo que no se confirmó: de por_confirmar o vencido a sent no
--      se puede saltar. Primero se confirma el pago.
--    · Se sella cuándo se confirmó y cuándo se envió.
create or replace function public.ticket_deliveries_estados()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'sent' and old.status in ('por_confirmar', 'vencido') then
      raise exception 'Primero confirmá el pago: un pedido sin confirmar no se puede marcar como enviado.'
        using errcode = 'P0001';
    end if;
    if new.status = 'pending' and old.status in ('por_confirmar', 'vencido') then
      new.confirmed_at := now();
    end if;
  end if;
  if tg_op = 'INSERT' and new.status in ('pending', 'sent') and new.confirmed_at is null then
    new.confirmed_at := now();
  end if;
  if new.status = 'sent' and new.sent_at is null then
    new.sent_at := now();
  end if;
  if new.status <> 'sent' then
    new.sent_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists ticket_deliveries_estados on public.ticket_deliveries;
create trigger ticket_deliveries_estados
  before insert or update on public.ticket_deliveries
  for each row execute function public.ticket_deliveries_estados();

-- 4) El pedido de la web
create or replace function public.crear_pedido_web(
  p_code       text,
  p_event_id   uuid,
  p_first_name text,
  p_last_name  text,
  p_email      text,
  p_phone      text,
  p_document   text,
  p_lines      jsonb,
  p_value      numeric
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code        text := upper(trim(p_code));
  v_existente   public.ticket_deliveries%rowtype;
  v_line        jsonb;
  v_type_id     uuid;
  v_qty         integer;
  v_unit        numeric;
  v_promo_id    uuid;
  v_precio      numeric;
  v_total_qty   integer := 0;
  v_total_lista numeric := 0;
  v_recientes   integer;
  v_user_id     uuid;
  v_id          uuid;
begin
  -- Datos del cliente
  if v_code !~ '^[A-HJKMNP-Z2-9]{6}$' then
    raise exception 'pedido_invalido: número de pedido' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_first_name), '') = '' or length(p_first_name) > 80
     or length(coalesce(p_last_name, '')) > 80 then
    raise exception 'pedido_invalido: nombre' using errcode = 'P0001';
  end if;
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_email) > 160 then
    raise exception 'pedido_invalido: email' using errcode = 'P0001';
  end if;
  if p_phone !~ '^\+[0-9]{8,15}$' then
    raise exception 'pedido_invalido: teléfono' using errcode = 'P0001';
  end if;
  if length(coalesce(p_document, '')) > 30 then
    raise exception 'pedido_invalido: documento' using errcode = 'P0001';
  end if;

  -- El evento tiene que estar a la venta
  if not exists (
    select 1 from public.events e
     where e.id = p_event_id
       and e.status = 'activo'
       and (e.sale_ends_at is null or e.sale_ends_at > now())
  ) then
    raise exception 'pedido_invalido: el evento no está a la venta' using errcode = 'P0001';
  end if;

  -- Las líneas: tipo que vende el evento, a su precio de lista, con promo asignada
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 10 then
    raise exception 'pedido_invalido: entradas' using errcode = 'P0001';
  end if;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_type_id  := (v_line->>'ticket_type_id')::uuid;
    v_qty      := (v_line->>'quantity')::integer;
    v_unit     := (v_line->>'unit_price')::numeric;
    v_promo_id := nullif(v_line->>'promo_id', '')::uuid;

    select ett.price into v_precio
      from public.event_ticket_types ett
     where ett.event_id = p_event_id and ett.ticket_type_id = v_type_id and ett.active;
    if not found or v_qty is null or v_qty not between 1 and 20 or v_unit is distinct from v_precio then
      raise exception 'pedido_invalido: tipo de entrada o precio' using errcode = 'P0001';
    end if;
    if v_promo_id is not null and not exists (
      select 1 from public.event_ticket_promos etp
       where etp.event_id = p_event_id and etp.promo_id = v_promo_id and etp.ticket_type_id = v_type_id
    ) then
      raise exception 'pedido_invalido: promo' using errcode = 'P0001';
    end if;
    v_total_qty   := v_total_qty + v_qty;
    v_total_lista := v_total_lista + v_qty * v_precio;
  end loop;

  if v_total_qty > 30 or p_value is null or p_value < 0 or p_value > v_total_lista then
    raise exception 'pedido_invalido: total' using errcode = 'P0001';
  end if;

  -- Freno al abuso: un mismo teléfono no acumula más de 5 pedidos abiertos.
  select count(*) into v_recientes
    from public.ticket_deliveries d
   where d.phone = p_phone and d.status = 'por_confirmar' and d.order_code <> v_code
     and d.created_at > now() - interval '48 hours';
  if v_recientes >= 5 then
    raise exception 'pedido_invalido: demasiados pedidos abiertos' using errcode = 'P0001';
  end if;

  select id into v_user_id from public.profiles where id = auth.uid();

  -- Mismo número: es el mismo pedido. Se reemplaza sólo si sigue sin
  -- confirmar y es del mismo teléfono; si no, se deja como está.
  select * into v_existente from public.ticket_deliveries where order_code = v_code;
  if found then
    if v_existente.status <> 'por_confirmar' or v_existente.phone is distinct from p_phone then
      return v_code;
    end if;
    update public.ticket_deliveries
       set event_id = p_event_id, first_name = trim(p_first_name), last_name = coalesce(trim(p_last_name), ''),
           email = lower(trim(p_email)), document_id = nullif(trim(p_document), ''),
           quantity = v_total_qty, value = p_value, user_id = coalesce(v_user_id, user_id)
     where id = v_existente.id;
    v_id := v_existente.id;
    delete from public.delivery_ticket_types where delivery_id = v_id;
  else
    insert into public.ticket_deliveries (
      event_id, user_id, first_name, last_name, email, phone, document_id,
      quantity, value, status, origin, order_code
    ) values (
      p_event_id, v_user_id, trim(p_first_name), coalesce(trim(p_last_name), ''),
      lower(trim(p_email)), p_phone, nullif(trim(p_document), ''),
      v_total_qty, p_value, 'por_confirmar', 'web', v_code
    )
    returning id into v_id;
  end if;

  insert into public.delivery_ticket_types (delivery_id, ticket_type_id, quantity, unit_price, promo_id)
  select v_id,
         (l->>'ticket_type_id')::uuid,
         (l->>'quantity')::integer,
         (l->>'unit_price')::numeric,
         nullif(l->>'promo_id', '')::uuid
    from jsonb_array_elements(p_lines) l;

  return v_code;
end;
$$;

revoke all on function public.crear_pedido_web(text, uuid, text, text, text, text, text, jsonb, numeric) from public;
grant execute on function public.crear_pedido_web(text, uuid, text, text, text, text, text, jsonb, numeric)
  to anon, authenticated;

-- 5) Un pedido no gasta cupo de promo: sólo cuentan las ventas confirmadas.
--    Si contara, alguien podría agotar una promo tocando "Enviar" sin pagar.
create or replace function public.promo_cupos_restantes()
returns table (event_id uuid, promo_id uuid, ticket_type_id uuid, restantes integer)
language sql
stable
security definer
set search_path = public
as $$
  select etp.event_id,
         etp.promo_id,
         etp.ticket_type_id,
         greatest(
           etp.quota - coalesce((
             select sum(dtt.quantity)
               from public.delivery_ticket_types dtt
               join public.ticket_deliveries d on d.id = dtt.delivery_id
              where d.event_id = etp.event_id
                and d.status in ('pending', 'sent')
                and dtt.promo_id = etp.promo_id
                and dtt.ticket_type_id = etp.ticket_type_id
           ), 0),
           0
         )::integer
    from public.event_ticket_promos etp
   where etp.quota is not null;
$$;

grant execute on function public.promo_cupos_restantes() to anon, authenticated;

-- 6) A las 48 hs sin comprobante, el pedido vence. Corre cada hora.
create or replace function public.vencer_pedidos_web()
returns void
language sql
security definer
set search_path = public
as $$
  update public.ticket_deliveries
     set status = 'vencido'
   where status = 'por_confirmar'
     and created_at < now() - interval '48 hours';
$$;

do $$
begin
  perform cron.unschedule('vencer-pedidos-web');
exception
  when others then null; -- si no existía, seguir
end $$;

select cron.schedule('vencer-pedidos-web', '7 * * * *', $$ select public.vencer_pedidos_web(); $$);

-- Verificación:
--   select status, count(*) from public.ticket_deliveries group by status;
--   select jobname, schedule, active from cron.job where jobname = 'vencer-pedidos-web';
