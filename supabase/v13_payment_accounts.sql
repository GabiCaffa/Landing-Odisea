-- ════════════════════════════════════════════════════════════════════════════
-- ODÍSEA · v13 · Cuentas de cobro por evento (ABM de "tarjetas")
-- ════════════════════════════════════════════════════════════════════════════
-- Hasta ahora los datos para transferir estaban HARDCODEADOS en el front
-- (TicketPurchaseModal.tsx). Esto los saca a una tabla catálogo y deja que cada
-- evento apunte a la cuenta que corresponda, así se puede cobrar en distintas
-- cuentas según el evento sin tocar código.
--
--   payment_accounts        → catálogo de cuentas (ABM en el panel admin)
--   events.payment_account_id → a qué cuenta transfiere la gente de ese evento
--
-- La cuenta del evento es OBLIGATORIA (not null): no puede haber un evento a la
-- venta sin saber a dónde va la plata. Por eso este script siembra la cuenta
-- actual (Itaú), hace backfill de los eventos existentes y RECIÉN AHÍ pone el
-- not null.
--
-- Pegar en: Supabase Dashboard → SQL Editor → New query. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1) Tabla catálogo ──────────────────────────────────────────────────────
create table if not exists public.payment_accounts (
  id             uuid primary key default gen_random_uuid(),
  -- Nombre interno para reconocerla en el panel ("Itaú Gabriel", "Brou Prod").
  label          text not null unique,
  holder_name    text not null,            -- GABRIEL CAFFAREL DALMAU
  bank           text not null,            -- ITAÚ
  account_type   text not null default '', -- CAJA DE AHORRO PESOS (UYU)
  account_number text not null,            -- 3483509
  document_id    text,                     -- cédula del titular (algunos bancos la piden)
  notes          text,                     -- instrucciones extra para el comprador
  -- Inactiva = no se ofrece al crear/editar eventos, pero los eventos viejos
  -- que ya la usaban la siguen mostrando (historial intacto).
  active         boolean not null default true,
  -- Preseleccionada en el formulario de evento. Como máximo una.
  is_default     boolean not null default false,
  created_at     timestamptz not null default now()
);

-- Una sola cuenta por defecto (garantía a nivel DB, además del trigger).
create unique index if not exists payment_accounts_one_default
  on public.payment_accounts (is_default) where is_default;

create index if not exists payment_accounts_active_idx
  on public.payment_accounts (active);

-- Al marcar una cuenta como default, desmarca las demás. Evita tener que
-- acordarse de hacerlo desde el cliente (y que el índice único explote).
create or replace function public.enforce_single_default_account()
returns trigger
language plpgsql
as $$
begin
  if new.is_default then
    update public.payment_accounts
       set is_default = false
     where is_default and id <> new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_single_default_account on public.payment_accounts;
create trigger trg_single_default_account
  before insert or update of is_default on public.payment_accounts
  for each row execute function public.enforce_single_default_account();

-- ─── 2) RLS ─────────────────────────────────────────────────────────────────
-- Lectura pública: el comprador tiene que ver a qué cuenta transferir. (Estos
-- datos ya eran públicos: estaban escritos en el JS del sitio.)
-- Escritura sólo admin: es plata, el operador no la toca.
alter table public.payment_accounts enable row level security;

drop policy if exists "payment_accounts_select_public" on public.payment_accounts;
drop policy if exists "payment_accounts_insert_admin"  on public.payment_accounts;
drop policy if exists "payment_accounts_update_admin"  on public.payment_accounts;
drop policy if exists "payment_accounts_delete_admin"  on public.payment_accounts;

create policy "payment_accounts_select_public" on public.payment_accounts
  for select using (true);
create policy "payment_accounts_insert_admin" on public.payment_accounts
  for insert with check (public.is_admin());
create policy "payment_accounts_update_admin" on public.payment_accounts
  for update using (public.is_admin()) with check (public.is_admin());
create policy "payment_accounts_delete_admin" on public.payment_accounts
  for delete using (public.is_admin());

-- ─── 3) Columna en events ───────────────────────────────────────────────────
-- on delete restrict: no se puede borrar una cuenta que algún evento usa. Para
-- sacarla de circulación se DESACTIVA (active = false), así el evento viejo
-- conserva a qué cuenta se cobró.
alter table public.events
  add column if not exists payment_account_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'events_payment_account_id_fkey'
  ) then
    alter table public.events
      add constraint events_payment_account_id_fkey
      foreign key (payment_account_id)
      references public.payment_accounts(id) on delete restrict;
  end if;
end $$;

create index if not exists events_payment_account_idx
  on public.events (payment_account_id);

-- ─── 4) Seed: la cuenta que se está usando hoy ──────────────────────────────
insert into public.payment_accounts
  (label, holder_name, bank, account_type, account_number, is_default)
values
  ('Itaú Gabriel', 'GABRIEL CAFFAREL DALMAU', 'ITAÚ',
   'CAJA DE AHORRO PESOS (UYU)', '3483509', true)
on conflict (label) do nothing;

-- ─── 5) Backfill + not null ─────────────────────────────────────────────────
-- Los eventos que ya existían quedan apuntando a la cuenta por defecto.
update public.events
   set payment_account_id = (select id from public.payment_accounts where is_default limit 1)
 where payment_account_id is null;

-- El not null se aplica sólo si el backfill cubrió todo (si no hay ninguna
-- cuenta cargada, el script no rompe: queda nullable y se reintenta al correrlo
-- de nuevo después de crear la primera cuenta).
do $$
begin
  if not exists (select 1 from public.events where payment_account_id is null) then
    alter table public.events alter column payment_account_id set not null;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- DESPUÉS de ejecutar esto:
--   · Panel admin → pestaña "Cuentas": ahí se cargan/editan las cuentas.
--   · Al crear o editar un evento hay que elegir una cuenta (campo obligatorio).
--   · El modal de compra muestra los datos de esa cuenta y los pone en el
--     mensaje de WhatsApp.
-- ════════════════════════════════════════════════════════════════════════════
