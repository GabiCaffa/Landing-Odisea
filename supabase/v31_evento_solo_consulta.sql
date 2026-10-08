-- ════════════════════════════════════════════════════════════════════════════
-- v31 — Eventos "solo consulta por WhatsApp" (sin venta de entradas online)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Hay fechas que no se venden desde el sitio: fiestas privadas o a coordinar
-- (por ejemplo la Nacho Fest). Para esas la tarjeta y la página no muestran
-- precios ni entradas, sólo un botón "Consultar por WhatsApp".
--
-- ─── Por qué una columna y no "un evento sin entradas" ──────────────────────
--
-- Hasta ahora un evento SIN tipos de entrada a la venta es un evento AGOTADO:
-- así lo tratan la tarjeta, la página, el selector de Compra Directa y el
-- JSON-LD para Google. Reinterpretar "sin entradas" como "solo consulta" daría
-- vuelta los eventos que hoy están agotados por esa vía. Una marca explícita no
-- cambia nada de lo existente: `default false`.
--
-- No necesita políticas nuevas: lectura pública y escritura `is_manager()`
-- (v22) ya cubren cualquier columna de `events`.
--
-- Idempotente. Pegar en el SQL Editor de Supabase.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.events
  add column if not exists consult_only boolean not null default false;

comment on column public.events.consult_only is
  'v31: true = sin venta online. La tarjeta y la página no muestran entradas ni precios, sólo el botón de consulta por WhatsApp.';

-- ════════════════════════════════════════════════════════════════════════════
-- Verificación
-- ════════════════════════════════════════════════════════════════════════════
--
-- select name, date, consult_only from public.events order by date;
--
-- Todos los eventos que ya existían quedan en `false`.
-- ════════════════════════════════════════════════════════════════════════════
