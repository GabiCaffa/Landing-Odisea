-- ════════════════════════════════════════════════════════════════════════════
-- v41 — Los pedidos de la web ya no vencen
-- ════════════════════════════════════════════════════════════════════════════
--
-- v40 pasaba a `vencido` los pedidos sin confirmar a las 48 hs. Pedido del
-- autor: sacarlo. Un pedido espera en "Por confirmar" hasta que el staff lo
-- confirme o lo borre: hay gente que transfiere días después y no tiene por
-- qué caer en otra lista.
--
-- Se apaga la tarea programada y los que ya hubieran vencido vuelven a "por
-- confirmar". El estado `vencido` queda permitido en la tabla para no romper
-- nada, pero ya nada lo usa.
--
-- El freno al abuso de v40 (hasta 5 pedidos abiertos por teléfono en 48 hs)
-- NO cambia: eso no es un vencimiento.
--
-- Idempotente. Pegar en el SQL Editor de Supabase.
-- ════════════════════════════════════════════════════════════════════════════

do $$
begin
  perform cron.unschedule('vencer-pedidos-web');
exception
  when others then null; -- si ya no existía, seguir
end $$;

drop function if exists public.vencer_pedidos_web();

update public.ticket_deliveries
   set status = 'por_confirmar'
 where status = 'vencido';

-- Verificación (las dos tienen que dar 0):
--   select count(*) from cron.job where jobname = 'vencer-pedidos-web';
--   select count(*) from public.ticket_deliveries where status = 'vencido';
