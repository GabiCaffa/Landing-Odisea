-- ════════════════════════════════════════════════════════════════════════════
-- ODÍSEA · v8 · Limpieza automática de cuentas SIN CONFIRMAR (pg_cron)
-- ════════════════════════════════════════════════════════════════════════════
-- Pegar y ejecutar en: Supabase Dashboard → SQL Editor → New query.
-- Idempotente: se puede correr varias veces sin romper nada.
--
-- QUÉ HACE: cada 5 minutos borra de auth.users los registros que NUNCA
-- confirmaron el email y ya tienen más de 15 minutos de creados. Así:
--   • Si alguien se equivocó de email (typo), esa cuenta pendiente desaparece
--     y el mail queda LIBRE para volver a registrarse.
--   • No quedan cuentas fantasma en el dashboard.
--
-- COMBINA CON:
--   • v7_profile_on_confirm.sql → el perfil (public.profiles) solo se crea al
--     confirmar, así que estos registros borrados nunca tuvieron perfil.
--   • Setting "Email OTP Expiration = 300" (5 min) en Authentication → Emails:
--     el link muere a los 5 min; la fila se borra a los 15 min.
--
-- NOTA sobre permisos: si "create extension pg_cron" da error de permisos,
-- activá la extensión desde Dashboard → Database → Extensions (buscá "pg_cron")
-- y después volvé a correr el resto de este script.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Extensión de scheduling.
create extension if not exists pg_cron;

-- 2) Función que hace la limpieza. security definer para poder tocar auth.users.
create or replace function public.cleanup_unconfirmed_users()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from auth.users
  where email_confirmed_at is null
    and created_at < now() - interval '15 minutes';
end;
$$;

-- 3) (Re)programar el job cada 5 minutos. Primero lo desprograma si ya existía,
--    para que correr este script de nuevo no cree duplicados.
do $$
begin
  perform cron.unschedule('cleanup-unconfirmed-users');
exception
  when others then null; -- si el job no existía, seguir sin error
end $$;

select cron.schedule(
  'cleanup-unconfirmed-users',
  '*/5 * * * *',
  $$ select public.cleanup_unconfirmed_users(); $$
);

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICAR después de correr:
--   • Ver el job programado:
--       select jobid, jobname, schedule, active from cron.job;
--   • Ver corridas recientes (éxito/error):
--       select * from cron.job_run_details order by start_time desc limit 10;
--   • Probar a mano la limpieza:
--       select public.cleanup_unconfirmed_users();
--
-- PARA DESACTIVAR el job en el futuro:
--       select cron.unschedule('cleanup-unconfirmed-users');
-- ════════════════════════════════════════════════════════════════════════════
