-- ════════════════════════════════════════════════════════════════════════════
-- v45 — Varios comprobantes por venta, cada uno con a qué cuenta fue
-- ════════════════════════════════════════════════════════════════════════════
--
-- v39 guardaba UN comprobante por venta (`ticket_deliveries.receipt_path`). No
-- alcanza con el caso que más se repite: alguien compra la fecha equivocada
-- (Colonia en vez de Paysandú), transfiere a la cuenta de Colonia, y después
-- manda la diferencia — a veces a la otra cuenta. Son dos comprobantes, a dos
-- cuentas distintas, y el segundo no tenía dónde ir.
--
-- ─── Una tabla, y la columna de v39 sigue mandando sobre el primero ─────────
-- `delivery_receipts` tiene TODOS los comprobantes de la venta. El primero —el
-- que se pega al cargar la venta— lo sigue escribiendo el panel en
-- `receipt_path` como hasta ahora, y un trigger lo copia a la tabla. Así la
-- carga de ventas (que es lo que más se usa) no cambia, y la tabla siempre
-- está completa. Los siguientes se agregan directo en la tabla.
--
-- ─── `account_id`: a qué cuenta se transfirió ───────────────────────────────
-- Es lo que permite ver "pagó a la cuenta de Colonia pero la venta es de
-- Paysandú". Por defecto, la cuenta del evento de la venta. `set null` al
-- borrar una cuenta (igual las cuentas no se borran si un evento las usa, v13).
--
-- Sólo staff, como las ventas (v11). Idempotente. Pegar en el SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) La tabla
create table if not exists public.delivery_receipts (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.ticket_deliveries(id) on delete cascade,
  path text not null,
  hash text,
  account_id uuid references public.payment_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (delivery_id, path)
);

create index if not exists delivery_receipts_delivery_idx on public.delivery_receipts(delivery_id);
create index if not exists delivery_receipts_hash_idx
  on public.delivery_receipts(hash) where hash is not null;

comment on table public.delivery_receipts is
  'v45: comprobantes de una venta (bucket privado `comprobantes`). El de receipt_path se copia solo.';

alter table public.delivery_receipts enable row level security;

drop policy if exists "delivery_receipts_staff" on public.delivery_receipts;
create policy "delivery_receipts_staff" on public.delivery_receipts
  for all using (public.is_staff()) with check (public.is_staff());

-- 2) La cuenta por defecto: la del evento de la venta.
create or replace function public.delivery_receipts_cuenta_default()
returns trigger
language plpgsql
as $$
begin
  if new.account_id is null then
    select e.payment_account_id into new.account_id
      from public.ticket_deliveries d
      join public.events e on e.id = d.event_id
     where d.id = new.delivery_id;
  end if;
  return new;
end;
$$;

drop trigger if exists delivery_receipts_cuenta_default on public.delivery_receipts;
create trigger delivery_receipts_cuenta_default
  before insert on public.delivery_receipts
  for each row execute function public.delivery_receipts_cuenta_default();

-- 3) El comprobante de v39 (`receipt_path`) se refleja en la tabla: al ponerlo
--    se agrega, al cambiarlo se reemplaza y al quitarlo se saca.
create or replace function public.ticket_deliveries_reflejar_comprobante()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.receipt_path is not null
     and old.receipt_path is distinct from new.receipt_path then
    delete from public.delivery_receipts
     where delivery_id = new.id and path = old.receipt_path;
  end if;
  if new.receipt_path is not null then
    insert into public.delivery_receipts (delivery_id, path, hash)
    values (new.id, new.receipt_path, new.receipt_hash)
    on conflict (delivery_id, path) do update set hash = coalesce(excluded.hash, delivery_receipts.hash);
  end if;
  return new;
end;
$$;

drop trigger if exists ticket_deliveries_reflejar_comprobante on public.ticket_deliveries;
create trigger ticket_deliveries_reflejar_comprobante
  after insert or update of receipt_path, receipt_hash on public.ticket_deliveries
  for each row execute function public.ticket_deliveries_reflejar_comprobante();

-- 4) Los comprobantes que ya están cargados pasan a la tabla, con la cuenta del
--    evento (es a donde se suponía que iba la plata; si no, se corrige a mano).
insert into public.delivery_receipts (delivery_id, path, hash, created_at)
select d.id, d.receipt_path, d.receipt_hash, d.created_at
  from public.ticket_deliveries d
 where d.receipt_path is not null
on conflict (delivery_id, path) do nothing;

-- Verificación (las dos cuentas tienen que dar lo mismo):
--   select count(*) from public.ticket_deliveries where receipt_path is not null;
--   select count(*) from public.delivery_receipts;
