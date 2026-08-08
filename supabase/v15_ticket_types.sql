-- ════════════════════════════════════════════════════════════════════════════
-- ODÍSEA · v15 · Tipos de entrada por evento (General / VIP / Backstage…)
-- ════════════════════════════════════════════════════════════════════════════
-- Hasta ahora el evento tenía UN precio (events.price) y el sitio inventaba un
-- único tipo "general" en el código (EventsSection/PromosSection). Ahora cada
-- evento vende los tipos que se le asignen, cada uno con su propio precio, y el
-- comprador arma su carrito eligiendo cuántas de cada uno.
--
--   ticket_types        → catálogo de tipos (ABM en el panel: nombre + qué incluye)
--   event_ticket_types  → qué vende cada evento y a qué precio
--
-- El precio vive en event_ticket_types porque el mismo "VIP" vale distinto en
-- cada fecha. events.price deja de escribirse a mano: pasa a ser un valor
-- DERIVADO (el más barato de los tipos activos), mantenido por un trigger, para
-- que el panel siga pudiendo mostrar un "desde $X" sin duplicar la verdad.
--
-- Pegar en: Supabase Dashboard → SQL Editor → New query. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1) Catálogo de tipos ───────────────────────────────────────────────────
create table if not exists public.ticket_types (
  id          uuid primary key default gen_random_uuid(),
  -- Único para que "VIP", "Vip" y "V.I.P." no convivan como tipos distintos.
  name        text not null unique,
  -- Qué incluye. Se le muestra al comprador debajo del nombre en el modal.
  description text,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists ticket_types_active_idx on public.ticket_types (active);

-- ─── 2) Qué vende cada evento y a cuánto ────────────────────────────────────
create table if not exists public.event_ticket_types (
  id             uuid primary key default gen_random_uuid(),
  -- cascade: si se borra el evento, sus precios se van con él (no sirven solos).
  event_id       uuid not null references public.events(id) on delete cascade,
  -- restrict: un tipo usado por algún evento no se borra; se DESACTIVA.
  ticket_type_id uuid not null references public.ticket_types(id) on delete restrict,
  price          numeric(10, 2) not null default 0 check (price >= 0),
  active         boolean not null default true,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  -- Un evento no puede tener dos veces el mismo tipo.
  unique (event_id, ticket_type_id)
);

create index if not exists event_ticket_types_event_idx
  on public.event_ticket_types (event_id);

-- ─── 3) events.price derivado del tipo más barato ───────────────────────────
create or replace function public.sync_event_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_id  uuid;
begin
  -- En DELETE no hay NEW y en INSERT no hay OLD: se arma la lista según el caso.
  -- Se contemplan los dos por si un UPDATE llegara a mover la fila de evento.
  if tg_op = 'DELETE' then
    v_ids := array[old.event_id];
  elsif tg_op = 'INSERT' then
    v_ids := array[new.event_id];
  else
    v_ids := array[new.event_id, old.event_id];
  end if;

  foreach v_id in array v_ids loop
    update public.events e
       set price = coalesce(
         (select min(t.price) from public.event_ticket_types t
           where t.event_id = v_id and t.active), 0)
     where e.id = v_id;
  end loop;

  return null;  -- trigger AFTER: el valor de retorno se ignora
end;
$$;

drop trigger if exists event_ticket_types_sync_price on public.event_ticket_types;
create trigger event_ticket_types_sync_price
  after insert or update or delete on public.event_ticket_types
  for each row execute function public.sync_event_price();

-- ─── 4) RLS ─────────────────────────────────────────────────────────────────
-- Lectura pública: el comprador tiene que ver los tipos y sus precios.
-- Escritura sólo admin (el operador no toca precios).
alter table public.ticket_types       enable row level security;
alter table public.event_ticket_types enable row level security;

drop policy if exists "ticket_types_select_public" on public.ticket_types;
drop policy if exists "ticket_types_insert_admin"  on public.ticket_types;
drop policy if exists "ticket_types_update_admin"  on public.ticket_types;
drop policy if exists "ticket_types_delete_admin"  on public.ticket_types;

create policy "ticket_types_select_public" on public.ticket_types
  for select using (true);
create policy "ticket_types_insert_admin" on public.ticket_types
  for insert with check (public.is_admin());
create policy "ticket_types_update_admin" on public.ticket_types
  for update using (public.is_admin()) with check (public.is_admin());
create policy "ticket_types_delete_admin" on public.ticket_types
  for delete using (public.is_admin());

drop policy if exists "event_ticket_types_select_public" on public.event_ticket_types;
drop policy if exists "event_ticket_types_insert_admin"  on public.event_ticket_types;
drop policy if exists "event_ticket_types_update_admin"  on public.event_ticket_types;
drop policy if exists "event_ticket_types_delete_admin"  on public.event_ticket_types;

create policy "event_ticket_types_select_public" on public.event_ticket_types
  for select using (true);
create policy "event_ticket_types_insert_admin" on public.event_ticket_types
  for insert with check (public.is_admin());
create policy "event_ticket_types_update_admin" on public.event_ticket_types
  for update using (public.is_admin()) with check (public.is_admin());
create policy "event_ticket_types_delete_admin" on public.event_ticket_types
  for delete using (public.is_admin());

-- ─── 5) Seed del catálogo ───────────────────────────────────────────────────
insert into public.ticket_types (name, description, sort_order) values
  ('General',   'Acceso general al evento.',                        1),
  ('VIP',       'Acceso a sector VIP.',                             2),
  ('Backstage', 'Acceso general + backstage.',                      3)
on conflict (name) do nothing;

-- ─── 6) Backfill: cada evento existente conserva su precio actual ───────────
-- Se le crea un tipo "General" con el price que ya tenía, así el sitio se
-- comporta igual el día que corrés esto.
insert into public.event_ticket_types (event_id, ticket_type_id, price, sort_order)
select e.id, (select id from public.ticket_types where name = 'General'), e.price, 1
  from public.events e
 where not exists (
   select 1 from public.event_ticket_types t where t.event_id = e.id
 )
on conflict (event_id, ticket_type_id) do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- DESPUÉS de ejecutar esto:
--   · Panel admin → pestaña "Entradas": ahí se cargan/editan los TIPOS.
--   · Al crear o editar un evento se eligen los tipos que vende y el precio de
--     cada uno (al menos uno). El campo "Precio" del evento ya no se escribe.
--   · En el sitio, el comprador elige cuántas de cada tipo; el total y el
--     desglose salen en el mensaje de WhatsApp.
-- ════════════════════════════════════════════════════════════════════════════
