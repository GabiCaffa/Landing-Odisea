-- ════════════════════════════════════════════════════════════════════════════
-- ODÍSEA · v24: promos con vencimiento por evento, cupo y precio especial
-- ════════════════════════════════════════════════════════════════════════════
-- Lo pide la sección "PROMOS ACTIVAS" de la home, con su contador ("te quedan
-- 23:59:12 para el 2x1 de Halloween"). Con lo de v21 no se podía por tres
-- motivos, y cada uno es una parte de esta migración:
--
-- ── 1) La ventana pasa del catálogo a la ASIGNACIÓN, y lleva hora ───────────
-- En v21 `starts_at`/`ends_at` eran `date` y vivían en `ticket_promos`: el
-- mismo "2x1" vencía el mismo día en todos los eventos que lo usaran, y un
-- contador regresivo no tiene contra qué contar si no hay hora. Ahora van en
-- `event_ticket_promos` como `timestamptz` — mismo criterio que el precio en
-- v15: el mecanismo es del catálogo, cuándo y cuánto es de cada fecha.
--
-- Las columnas del catálogo NO se borran todavía. El front desplegado hoy las
-- lee y las escribe; si desaparecieran, entre correr esto y el deploy el panel
-- fallaría al guardar una promo. Quedan marcadas como obsoletas y se van en
-- una migración posterior.
--
-- ── 2) Dos mecanismos nuevos ────────────────────────────────────────────────
--   · "% off en todas" NO es un tipo nuevo: es la fórmula de v21 con N = 1
--     ("cada 1 entrada, 1 al 20%"). Lo que lo impedía era el CHECK
--     `discounted_units < every_n`, que existía para no regalar el grupo
--     entero. Se reescribe para prohibir JUSTO eso —descontar el 100% de todas—
--     y nada más: "cada 1, 1 al 20%" y "cada 2, 2 al 50%" pasan a valer.
--   · "Precio especial" SÍ es un tipo aparte (`kind`), porque el número depende
--     del evento y del tipo de entrada ("la General a $500"): va en la
--     asignación (`special_price`), no en el catálogo.
--
-- ── 3) Cupo, contado desde las ventas y no a mano ──────────────────────────
-- `quota` es cuántas entradas se venden con la promo (las de regalo del 2x1
-- cuentan: "50 entradas en 2x1" son 50 entradas). Lo vendido NO es un contador
-- que alguien descuenta: sale de las entregas cargadas, a través de la nueva
-- `delivery_ticket_types.promo_id`. Un contador a mano se desincroniza; éste
-- no puede. El precio es que se actualiza cuando el staff carga la entrega.
--
-- El público no puede leer Entregas (montos y datos de compradores), así que
-- la home pide SÓLO el número restante a `promo_cupos_restantes()`.
--
-- Pegar en: Supabase Dashboard → SQL Editor → New query. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1) Catálogo: tipo de promo y la fórmula ampliada ───────────────────────
alter table public.ticket_promos
  add column if not exists kind text not null default 'descuento';

alter table public.ticket_promos drop constraint if exists ticket_promos_kind;
alter table public.ticket_promos
  add constraint ticket_promos_kind check (kind in ('descuento', 'precio_especial'));

-- Un precio especial no tiene fórmula: los números de v21 pasan a opcionales,
-- y un CHECK los exige sólo donde tienen sentido.
alter table public.ticket_promos alter column every_n drop not null;
alter table public.ticket_promos alter column percent_off drop not null;

alter table public.ticket_promos drop constraint if exists ticket_promos_mecanismo;
alter table public.ticket_promos
  add constraint ticket_promos_mecanismo check (
    kind <> 'descuento' or (every_n is not null and percent_off is not null)
  );

-- v21 exigía every_n >= 2 (CHECK de columna, con el nombre automático de
-- Postgres). Con N = 1 es "% off en todas".
alter table public.ticket_promos drop constraint if exists ticket_promos_every_n_check;
alter table public.ticket_promos drop constraint if exists ticket_promos_every_n;
alter table public.ticket_promos
  add constraint ticket_promos_every_n check (every_n >= 1);

-- Antes: M < N, siempre. Ahora: M <= N, y M = N sólo si NO es el 100%.
-- "cada 3, 3 al 100%" sigue prohibido —es regalar—; "cada 1, 1 al 20%" no.
alter table public.ticket_promos drop constraint if exists ticket_promos_unidades;
alter table public.ticket_promos
  add constraint ticket_promos_unidades check (
    discounted_units <= every_n
    and (discounted_units < every_n or percent_off < 100)
  );

comment on column public.ticket_promos.starts_at is
  'OBSOLETA desde v24: la vigencia vive en event_ticket_promos.starts_at. No usar.';
comment on column public.ticket_promos.ends_at is
  'OBSOLETA desde v24: la vigencia vive en event_ticket_promos.ends_at. No usar.';

-- ─── 2) Asignación: ventana con hora, cupo y precio especial ────────────────
-- La ventana se copia del catálogo UNA sola vez: al crear las columnas. Si el
-- backfill corriera cada vez, volver a pegar este archivo le devolvería la
-- fecha de fin a una promo que el admin ya había dejado "sin límite".
do $$
declare
  columnas_nuevas boolean;
begin
  columnas_nuevas := not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'event_ticket_promos'
      and column_name = 'starts_at'
  );

  alter table public.event_ticket_promos
    add column if not exists starts_at timestamptz,
    add column if not exists ends_at timestamptz;

  if columnas_nuevas then
    -- Hora de Uruguay: la fecha de v21 era "el día" para quien mira desde acá.
    -- Arranca a las 00:00 y termina a las 23:59:59 de ese día, así ninguna
    -- promo cambia de vigencia por esta migración.
    update public.event_ticket_promos etp
       set starts_at = (p.starts_at::timestamp) at time zone 'America/Montevideo',
           ends_at   = (p.ends_at + time '23:59:59') at time zone 'America/Montevideo'
      from public.ticket_promos p
     where p.id = etp.promo_id
       and (p.starts_at is not null or p.ends_at is not null);
  end if;
end $$;

alter table public.event_ticket_promos
  add column if not exists quota integer,
  add column if not exists special_price numeric(10, 2);

alter table public.event_ticket_promos drop constraint if exists event_ticket_promos_ventana;
alter table public.event_ticket_promos
  add constraint event_ticket_promos_ventana check (
    starts_at is null or ends_at is null or starts_at < ends_at
  );

alter table public.event_ticket_promos drop constraint if exists event_ticket_promos_quota;
alter table public.event_ticket_promos
  add constraint event_ticket_promos_quota check (quota is null or quota > 0);

alter table public.event_ticket_promos drop constraint if exists event_ticket_promos_special_price;
alter table public.event_ticket_promos
  add constraint event_ticket_promos_special_price check (
    special_price is null or special_price >= 0
  );

-- ─── 3) El precio especial tiene que venir con precio, y sólo él ────────────
-- Un CHECK no puede mirar otra tabla (el `kind` está en el catálogo), por eso
-- es un trigger. No "arregla" nada en silencio: si el dato no cierra, rechaza.
create or replace function public.check_event_promo_price()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  promo record;
begin
  select name, kind into promo from public.ticket_promos where id = new.promo_id;

  if promo.kind = 'precio_especial' and new.special_price is null then
    raise exception 'La promo "%" es de precio especial: falta el precio para este evento.', promo.name;
  end if;

  if promo.kind = 'descuento' and new.special_price is not null then
    raise exception 'La promo "%" es un descuento, no lleva precio especial.', promo.name;
  end if;

  return new;
end;
$$;

drop trigger if exists event_ticket_promos_check_price on public.event_ticket_promos;
create trigger event_ticket_promos_check_price
  before insert or update on public.event_ticket_promos
  for each row execute function public.check_event_promo_price();

-- Y por el mismo motivo, una promo que ya está en algún evento no cambia de
-- tipo: pasar un "2x1" a precio especial dejaría a esos eventos sin precio.
create or replace function public.lock_promo_kind()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.kind is distinct from old.kind
     and exists (select 1 from public.event_ticket_promos where promo_id = new.id) then
    raise exception 'La promo "%" está en uso en algún evento: no se puede cambiar de tipo. Creá una nueva.', old.name;
  end if;
  return new;
end;
$$;

drop trigger if exists ticket_promos_lock_kind on public.ticket_promos;
create trigger ticket_promos_lock_kind
  before update on public.ticket_promos
  for each row execute function public.lock_promo_kind();

-- ─── 4) Qué promo se aplicó en cada venta ───────────────────────────────────
-- Una línea del desglose de v18 = un tipo de entrada, así que la promo va ahí
-- y no en la entrega: un carrito puede tener 2x1 en General y nada en VIP.
-- restrict: una promo con ventas cargadas no se borra del catálogo, se
-- desactiva (mismo criterio que los tipos de entrada en v18).
alter table public.delivery_ticket_types
  add column if not exists promo_id uuid references public.ticket_promos(id) on delete restrict;

create index if not exists delivery_ticket_types_promo_idx
  on public.delivery_ticket_types (promo_id);

-- ─── 5) Cupo restante, para la cara pública ─────────────────────────────────
-- security definer porque cuenta sobre tablas que el público no puede leer.
-- Devuelve SÓLO el número restante de las asignaciones que tienen cupo: ni
-- montos, ni compradores, ni cuántas se vendieron sin promo.
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
                and dtt.promo_id = etp.promo_id
                and dtt.ticket_type_id = etp.ticket_type_id
           ), 0),
           0
         )::integer
    from public.event_ticket_promos etp
   where etp.quota is not null;
$$;

grant execute on function public.promo_cupos_restantes() to anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- Para revisar después de correrlo:
--
--   -- Las ventanas migradas (tendrían que coincidir con las fechas de v21):
--   select e.name, p.name, etp.starts_at, etp.ends_at, etp.quota, etp.special_price
--     from public.event_ticket_promos etp
--     join public.events e on e.id = etp.event_id
--     join public.ticket_promos p on p.id = etp.promo_id
--    order by e.date;
--
--   -- El cupo que ve la home:
--   select * from public.promo_cupos_restantes();
-- ════════════════════════════════════════════════════════════════════════════
