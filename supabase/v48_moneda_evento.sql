-- ════════════════════════════════════════════════════════════════════════════
-- v48 — Moneda por evento (pesos o dólares)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Hay eventos que se venden en dólares. Hasta acá todo el sitio daba por hecho
-- que un precio era en pesos: el "$" estaba escrito a mano en cada pantalla.
--
-- ─── La moneda es del EVENTO, no de cada tipo de entrada ────────────────────
-- Un evento se vende entero en una moneda: sus entradas, sus promos, su total
-- y la cuenta donde cobra. Ponerla en `event_ticket_types` dejaría armar un
-- carrito con pesos y dólares mezclados, que no se puede sumar ni transferir
-- de una vez. Una columna en `events`, por defecto 'UYU': correr esto no
-- cambia ningún evento que ya existe.
--
-- ─── Las ventas NO guardan moneda ───────────────────────────────────────────
-- `ticket_deliveries.value` es un número y su moneda es la de su evento, que
-- no se puede borrar mientras tenga ventas (`on delete restrict`, v9). Una
-- segunda copia del dato sólo podría quedar distinta de la primera.
--
-- ─── La Historia SÍ la guarda ───────────────────────────────────────────────
-- `event_history` (v47) es una foto que sobrevive al evento (`set null`), así
-- que tiene que llevar su propia moneda: sin el evento no habría de dónde
-- sacarla.
--
-- ─── Cambiar la moneda de un evento con ventas ──────────────────────────────
-- No se bloquea en la base: el panel avisa. Lo que ya se cobró queda con el
-- número que tenía y pasa a leerse en la moneda nueva, así que sólo tiene
-- sentido para corregir un evento cargado mal ANTES de vender.
--
-- Idempotente. Pegar en el SQL Editor de Supabase.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.events
  add column if not exists currency text not null default 'UYU';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'events_currency_check' and conrelid = 'public.events'::regclass
  ) then
    alter table public.events
      add constraint events_currency_check check (currency in ('UYU', 'USD'));
  end if;
end $$;

comment on column public.events.currency is
  'v48: moneda en la que se vende el evento entero (UYU o USD). Sus precios, promos y ventas se leen en esta moneda.';

-- La Historia (v47), si ya está: cada evento guardado con su moneda.
do $$
begin
  if to_regclass('public.event_history') is not null then
    alter table public.event_history
      add column if not exists currency text not null default 'UYU';
    if not exists (
      select 1 from pg_constraint
       where conname = 'event_history_currency_check'
         and conrelid = 'public.event_history'::regclass
    ) then
      alter table public.event_history
        add constraint event_history_currency_check check (currency in ('UYU', 'USD'));
    end if;
  end if;
end $$;

-- Verificación:
--   select currency, count(*) from public.events group by currency;   -- todo UYU al principio
