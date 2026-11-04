-- ════════════════════════════════════════════════════════════════════════════
-- v42 — Cantidad de ganadores por votación
-- ════════════════════════════════════════════════════════════════════════════
--
-- Cuando una votación cierra (a mano, o sola por `closes_at`), la home muestra
-- un destacado con los ganadores. Cuántos son depende de cada votación (por
-- ejemplo 3 en Colonia y 4 en Paysandú), así que es una columna de `contests`.
--
-- Por defecto 3, que era el podio fijo de antes: correrla no cambia nada de lo
-- ya cargado. Idempotente. Requiere v35.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.contests
  add column if not exists winners_count integer not null default 3;

alter table public.contests
  drop constraint if exists contests_winners_count_rango;
alter table public.contests
  add constraint contests_winners_count_rango
  check (winners_count between 1 and 10);

comment on column public.contests.winners_count is
  'v42: cuántos ganadores se destacan al cerrar la votación (1 a 10, por defecto 3).';

-- Verificación:
-- select title, status, closes_at, winners_count from public.contests order by created_at;
