-- ════════════════════════════════════════════════════════════════════════════
-- v47 — Historia de ODÍSEA: cada evento con sus números, y quién compró
-- ════════════════════════════════════════════════════════════════════════════
--
-- Las ventas (`ticket_deliveries`) son la herramienta del día a día y se
-- limpian: desde el borrado en lote, lo que no se guarda en otro lado se
-- pierde. Esto es el archivo: una fila por evento con sus números ya
-- congelados (entradas, tipos, recaudado, compradores) y una fila por
-- comprador, que es de donde sale el ranking de los que más van.
--
-- ─── Se guarda con un botón, no solo ────────────────────────────────────────
-- Decisión del autor. El staff toca "Guardar en la historia" cuando terminaron
-- las ventas y los envíos; si después se corrige algo, se vuelve a guardar y
-- se reemplaza. Un evento del sitio tiene UNA fila (`event_id` único); las que
-- vienen de planillas viejas de Excel no tienen evento (`event_id` null).
--
-- ─── `event_id` con `set null` ──────────────────────────────────────────────
-- Borrar el evento del sitio no borra su historia: es justamente para eso.
--
-- ─── Sólo staff, como las ventas ────────────────────────────────────────────
-- Son montos y datos de compradores: los mismos que ve Entregas (`is_staff()`,
-- admin y operador, v11). El rol `cumples` no los ve.
--
-- Idempotente. Pegar en el SQL Editor de Supabase.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.event_history (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete set null,
  name text not null,
  event_date date,
  location text,
  -- 'panel' = guardado desde las ventas del sitio; 'planilla' = Excel viejo.
  origin text not null default 'panel' check (origin in ('panel', 'planilla')),
  ventas integer not null default 0,
  entradas integer not null default 0,
  recaudado numeric(12, 2) not null default 0,
  compradores integer not null default 0,
  -- [{ "nombre": "General", "entradas": 120, "recaudado": 96000 }, …]
  por_tipo jsonb not null default '[]'::jsonb,
  cumpleaneros integer not null default 0,
  notes text,
  saved_at timestamptz not null default now(),
  saved_by uuid default auth.uid()
);

create unique index if not exists event_history_event_unique
  on public.event_history(event_id) where event_id is not null;
create index if not exists event_history_date_idx on public.event_history(event_date desc);

create table if not exists public.event_history_buyers (
  id uuid primary key default gen_random_uuid(),
  history_id uuid not null references public.event_history(id) on delete cascade,
  name text not null default '',
  email text,
  phone text,
  document_id text,
  entradas integer not null default 0,
  monto numeric(12, 2) not null default 0
);

create index if not exists event_history_buyers_history_idx on public.event_history_buyers(history_id);
create index if not exists event_history_buyers_email_idx on public.event_history_buyers(lower(email));
create index if not exists event_history_buyers_phone_idx on public.event_history_buyers(phone);

comment on table public.event_history is
  'v47: Historia de ODÍSEA. Un evento con sus números congelados; se guarda desde el panel o se importa de una planilla.';
comment on table public.event_history_buyers is
  'v47: compradores de cada evento de la historia. De acá sale el ranking de los que más van.';

alter table public.event_history enable row level security;
alter table public.event_history_buyers enable row level security;

drop policy if exists "event_history_staff" on public.event_history;
create policy "event_history_staff" on public.event_history
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "event_history_buyers_staff" on public.event_history_buyers;
create policy "event_history_buyers_staff" on public.event_history_buyers
  for all using (public.is_staff()) with check (public.is_staff());

-- Verificación:
--   select count(*) from public.event_history;           -- 0 al principio
--   select count(*) from public.event_history_buyers;    -- 0 al principio
