-- ════════════════════════════════════════════════════════════════════════════
-- ODÍSEA · v21: promos de entradas (2x1, 2da al 50%, 3x2…)
-- ════════════════════════════════════════════════════════════════════════════
-- Un CATÁLOGO de promos + una tabla de unión que dice qué evento usa cuál y
-- sobre qué tipo de entrada. Mismo molde que ticket_types ↔ event_ticket_types
-- (v15), y por el mismo motivo: la misma promo se aplica a varios eventos.
--
-- ── El mecanismo, en tres números ───────────────────────────────────────────
--   "cada EVERY_N entradas, DISCOUNTED_UNITS con PERCENT_OFF% de descuento"
--
--   2x1                  → cada 2, 1 al 100%
--   2da al 50%           → cada 2, 1 al 50%
--   3x2                  → cada 3, 1 al 100%
--   3 al precio de 1     → cada 3, 2 al 100%
--   cada 4, 2 a mitad    → cada 4, 2 al 50%
--
--   descuento = floor(cantidad / every_n) * discounted_units * precio * percent_off / 100
--
-- El tercer número existe porque con uno fijo en 1 no se podía expresar "3 al
-- precio de 1" ni "cada 4, dos a mitad de precio".
--
-- Con 4 entradas y "2da al 50%" se aplica DOS veces. Es a propósito: si no, la
-- promo premiaría comprar de a dos y castigaría comprar de a cuatro.
--
-- ── Los dos números son INTERNOS ────────────────────────────────────────────
-- El comprador nunca ve la fórmula: ve `name` ("2x1") y el precio ya
-- descontado. Por eso `name` se escribe pensando en el cliente, no en el admin.
--
-- ── Apunta al CATÁLOGO de tipos, no a event_ticket_types ───────────────────
-- Misma lección que v18: `saveEventTickets` BORRA filas de event_ticket_types
-- cuando un evento deja de vender un tipo. Una FK ahí haría fallar la edición
-- de las entradas de un evento que tenga una promo cargada.
--
-- Pegar en: Supabase Dashboard → SQL Editor → New query. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1) Catálogo de promos ──────────────────────────────────────────────────
create table if not exists public.ticket_promos (
  id uuid primary key default gen_random_uuid(),
  -- Lo que LEE el cliente. "2x1", "2da al 50%", "Llevá 3 pagá 2".
  name text not null,
  -- Detalle opcional, también para el cliente.
  description text,
  -- Los dos números del mecanismo. Internos: no se muestran.
  every_n integer not null check (every_n >= 2),
  -- Cuántas de esas N se descuentan. Menor que every_n: descontar las N sería
  -- regalar el grupo entero, que no es una promo sino un precio cero.
  discounted_units integer not null default 1 check (discounted_units >= 1),
  percent_off integer not null check (percent_off between 1 and 100),
  -- Ventana de vigencia. NULL a cualquiera de los dos lados = sin límite.
  starts_at date,
  ends_at date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  -- Una ventana al revés no es un caso raro: es un error de carga.
  constraint ticket_promos_ventana check (
    starts_at is null or ends_at is null or starts_at <= ends_at
  ),
  constraint ticket_promos_unidades check (discounted_units < every_n)
);

-- Para quien ya corrió una versión anterior de este archivo: agrega la columna
-- y el CHECK sin tocar lo que ya haya cargado.
alter table public.ticket_promos
  add column if not exists discounted_units integer not null default 1;
alter table public.ticket_promos drop constraint if exists ticket_promos_unidades;
alter table public.ticket_promos
  add constraint ticket_promos_unidades check (discounted_units < every_n);

-- ─── 2) Qué evento usa qué promo, sobre qué tipo de entrada ─────────────────
create table if not exists public.event_ticket_promos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  promo_id uuid not null references public.ticket_promos(id) on delete restrict,
  ticket_type_id uuid not null references public.ticket_types(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  -- La MISMA promo no se carga dos veces sobre el mismo tipo en el mismo
  -- evento. Sí se permiten promos DISTINTAS sobre el mismo tipo: es lo que
  -- deja programar una de preventa y otra después, cada una con su ventana.
  unique (event_id, promo_id, ticket_type_id)
);

-- `on delete cascade` en el evento: si se borra el evento, sus promos no
-- tienen sentido. `on delete restrict` en la promo y en el tipo: no se borra
-- del catálogo algo que un evento está usando (mismo criterio que v13).

create index if not exists event_ticket_promos_event_idx
  on public.event_ticket_promos(event_id);

-- ─── 3) RLS ─────────────────────────────────────────────────────────────────
-- Lectura PÚBLICA: el comprador tiene que poder ver la promo y que le den los
-- números, igual que ve los precios. Escritura SÓLO admin: ni el operador ni
-- el encargado de cumpleaños tocan lo que se cobra.
alter table public.ticket_promos enable row level security;
alter table public.event_ticket_promos enable row level security;

drop policy if exists "ticket_promos_select_public" on public.ticket_promos;
drop policy if exists "ticket_promos_write_admin" on public.ticket_promos;
create policy "ticket_promos_select_public" on public.ticket_promos
  for select using (true);
create policy "ticket_promos_write_admin" on public.ticket_promos
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "event_ticket_promos_select_public" on public.event_ticket_promos;
drop policy if exists "event_ticket_promos_write_admin" on public.event_ticket_promos;
create policy "event_ticket_promos_select_public" on public.event_ticket_promos
  for select using (true);
create policy "event_ticket_promos_write_admin" on public.event_ticket_promos
  for all using (public.is_admin()) with check (public.is_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- Dar de alta promos a mano (opcional: el panel también las crea)
-- ════════════════════════════════════════════════════════════════════════════
-- Crear las dos del ejemplo:
--
--   insert into public.ticket_promos (name, every_n, discounted_units, percent_off)
--   values ('2x1', 2, 1, 100),
--          ('3x2', 3, 1, 100),
--          ('3 al precio de 1', 3, 2, 100),
--          ('2da al 50%', 2, 1, 50);
--
-- Ver qué promos hay y sus id:
--
--   select id, name, every_n, discounted_units, percent_off, starts_at, ends_at, active
--   from public.ticket_promos order by created_at;
--
-- Aplicar una promo a un evento, sobre un tipo de entrada:
--
--   insert into public.event_ticket_promos (event_id, promo_id, ticket_type_id)
--   select e.id, p.id, t.id
--   from public.events e, public.ticket_promos p, public.ticket_types t
--   where e.name = 'HALLOWEEN COLONIA'
--     and p.name = '2x1'
--     and t.name = 'General';
--
-- Sacarla de un evento (no borra la promo del catálogo):
--
--   delete from public.event_ticket_promos
--   where event_id = (select id from public.events where name = 'HALLOWEEN COLONIA')
--     and promo_id = (select id from public.ticket_promos where name = '2x1');
--
-- Borrar una promo del catálogo (falla si algún evento la usa, a propósito):
--
--   delete from public.ticket_promos where name = '2x1';
-- ════════════════════════════════════════════════════════════════════════════
