-- ════════════════════════════════════════════════════════════════════════════
-- v49 — Eventos "próximamente" (flyer borroso + contador)
-- ════════════════════════════════════════════════════════════════════════════
--
-- `events.reveal_at`: cuándo se revela el evento y se abre la venta. Mientras esa
-- fecha no llegó, la web muestra el evento como teaser: flyer borroso con un
-- candado, "Próximamente" y un contador, sin link ni compra. Al llegar a cero la
-- tarjeta se desbloquea sola.
--
-- NULL = evento normal (todos los que ya existen): correrla no cambia nada.
-- Idempotente. Pegar en el SQL Editor de Supabase.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.events
  add column if not exists reveal_at timestamptz;

comment on column public.events.reveal_at is
  'v49: si es futuro, el evento se muestra como teaser (flyer borroso + contador) hasta esa hora.';

notify pgrst, 'reload schema';

-- Verificación:
-- select name, date, reveal_at from public.events order by date;
