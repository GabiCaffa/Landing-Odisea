-- ════════════════════════════════════════════════════════════════════════════
-- v32 — Orden manual de los eventos en la home
-- ════════════════════════════════════════════════════════════════════════════
--
-- La grilla de "Próximos eventos" siempre salió ordenada por fecha. Para una web
-- que vende, a veces conviene poner primero la fecha que más se quiere vender,
-- y eso no siempre es la más cercana. Esta columna deja que el staff elija el
-- orden desde el panel (Eventos → "Orden en la home").
--
-- • `home_order` NULL (el valor de todos los eventos que ya existen) = sin orden
--   elegido: se ordena por fecha, como siempre. Correr esta migración no mueve
--   nada de lugar.
-- • Al reordenar desde el panel se numeran 0, 1, 2… los eventos de la grilla.
--   Los eventos sin número (por ejemplo uno recién creado) van AL FINAL, por
--   fecha, hasta que se los ubique.
-- • Los agotados siguen yendo al final de la grilla, sin importar su número.
--
-- No necesita políticas nuevas: la escritura de `events` ya es de `is_manager()`
-- (v22), o sea admin y operador.
--
-- Idempotente. Pegar en el SQL Editor de Supabase.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.events
  add column if not exists home_order integer;

comment on column public.events.home_order is
  'v32: orden elegido a mano en la home (0 = primero). NULL = sin orden elegido: va por fecha, después de los que tienen número.';

-- ════════════════════════════════════════════════════════════════════════════
-- Verificación
-- ════════════════════════════════════════════════════════════════════════════
--
-- select name, date, home_order from public.events order by home_order nulls last, date;
-- ════════════════════════════════════════════════════════════════════════════
