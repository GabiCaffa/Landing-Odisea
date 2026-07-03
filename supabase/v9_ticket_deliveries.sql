-- ════════════════════════════════════════════════════════════════════════════
-- ODÍSEA · v9: Entregas de entradas (carga manual, sólo admin)
-- ════════════════════════════════════════════════════════════════════════════
-- Control de a quién hay que enviarle las entradas por mail y a quién ya se le
-- enviaron, AGRUPADO POR EVENTO. No tiene relación con profiles: los datos del
-- cliente se cargan a mano (nombre, contacto, ubicación, documento) + cantidad
-- de entradas y valor total pagado. Reemplaza el Excel aparte.
--
-- Pegar en: Supabase Dashboard → SQL Editor → New query. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.ticket_deliveries (
  id           uuid primary key default gen_random_uuid(),
  -- on delete restrict: NO se puede borrar un evento que todavía tiene entregas
  -- cargadas (protege el historial de un borrado accidental).
  event_id     uuid not null references public.events(id) on delete restrict,
  first_name   text not null,
  last_name    text not null,
  birth_date   date,
  country      text,
  state        text,
  document_id  text,
  phone        text,           -- E.164
  email        text not null,  -- destino del envío de las entradas
  quantity     integer not null default 1 check (quantity > 0),
  value        numeric(12,2) not null default 0 check (value >= 0), -- total pagado
  status       text not null default 'pending' check (status in ('pending','sent')),
  sent_at      timestamptz,
  notes        text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists deliveries_event_idx   on public.ticket_deliveries(event_id);
create index if not exists deliveries_status_idx   on public.ticket_deliveries(status);
create index if not exists deliveries_created_idx  on public.ticket_deliveries(created_at desc);

alter table public.ticket_deliveries enable row level security;

-- Acceso exclusivo de administradores en todas las operaciones.
drop policy if exists "deliveries_select_admin" on public.ticket_deliveries;
drop policy if exists "deliveries_insert_admin" on public.ticket_deliveries;
drop policy if exists "deliveries_update_admin" on public.ticket_deliveries;
drop policy if exists "deliveries_delete_admin" on public.ticket_deliveries;

create policy "deliveries_select_admin" on public.ticket_deliveries
  for select using (public.is_admin());
create policy "deliveries_insert_admin" on public.ticket_deliveries
  for insert with check (public.is_admin());
create policy "deliveries_update_admin" on public.ticket_deliveries
  for update using (public.is_admin()) with check (public.is_admin());
create policy "deliveries_delete_admin" on public.ticket_deliveries
  for delete using (public.is_admin());

-- ════════════════════════════════════════════════════════════════════════════
