-- ════════════════════════════════════════════════════════════════════════════
-- ODÍSEA · v19 · Ajustes del sitio (clave/valor) + tema estacional
-- ════════════════════════════════════════════════════════════════════════════
-- Para Halloween 2026 el sitio cambia de paleta. La pregunta era dónde vive el
-- interruptor: en el código (hay que deployar para prenderlo y para apagarlo) o
-- en la base (se prende desde el panel). Va en la base.
--
-- El motivo es operativo, no técnico: el sitio está VENDIENDO entradas. Si el
-- tema se ve mal en un celular a las 3 de la mañana, se apaga desde el panel en
-- 5 segundos; con un flag en el código, cada duda es un commit y un deploy.
--
--   site_settings → tabla clave/valor para banderas globales del sitio
--   site_settings['theme'] → 'base' (paleta ODÍSEA) | 'halloween'
--
-- Es clave/valor GENÉRICA y no una tabla `theme` a propósito: cuesta lo mismo, y
-- la próxima bandera del sitio (un banner de aviso, "preventa cerrada") no va a
-- necesitar otra migración. Una tabla con el nombre de un solo booleano envejece
-- mal.
--
-- Pegar en: Supabase Dashboard → SQL Editor → New query. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1) Tabla ───────────────────────────────────────────────────────────────
create table if not exists public.site_settings (
  key        text primary key,
  value      text not null default '',
  updated_at timestamptz not null default now()
);

-- `updated_at` se mantiene solo: es el único dato de auditoría que tiene la
-- tabla y no queremos depender de que el cliente se acuerde de mandarlo.
create or replace function public.touch_site_setting()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_site_setting on public.site_settings;
create trigger trg_touch_site_setting
  before update on public.site_settings
  for each row execute function public.touch_site_setting();

-- ─── 2) RLS ─────────────────────────────────────────────────────────────────
-- Lectura PÚBLICA: la landing tiene que saber qué tema pintar antes de que
-- nadie inicie sesión. Lo que se expone es el nombre de un tema, nada sensible.
-- Escritura SÓLO ADMIN: el operador gestiona entregas y cumpleaños, no la cara
-- pública del sitio. Mismo criterio que las cuentas de cobro (v13).
alter table public.site_settings enable row level security;

drop policy if exists "site_settings_select_public" on public.site_settings;
drop policy if exists "site_settings_insert_admin"  on public.site_settings;
drop policy if exists "site_settings_update_admin"  on public.site_settings;
drop policy if exists "site_settings_delete_admin"  on public.site_settings;

create policy "site_settings_select_public" on public.site_settings
  for select using (true);
create policy "site_settings_insert_admin" on public.site_settings
  for insert with check (public.is_admin());
create policy "site_settings_update_admin" on public.site_settings
  for update using (public.is_admin()) with check (public.is_admin());
create policy "site_settings_delete_admin" on public.site_settings
  for delete using (public.is_admin());

-- ─── 3) Realtime (mejor esfuerzo, NO puede voltear el script) ───────────────
-- Para que al prender el tema las pestañas YA ABIERTAS cambien solas, sin que
-- nadie recargue. El `if not exists` es porque `alter publication ... add table`
-- falla si la tabla ya está en la publicación (y esto tiene que poder correrse
-- dos veces).
--
-- Va envuelto en un `exception when others` por algo concreto: el SQL Editor de
-- Supabase corre TODO el script en una sola transacción, así que un error acá
-- —la publicación que no existe, permisos sobre ella— revierte hasta la
-- creación de la tabla, y uno se queda con "lo corrí y no pasó nada". El
-- realtime es una comodidad (que las pestañas abiertas cambien solas); la tabla
-- y sus políticas no. Si esto falla, avisa y el resto queda igual aplicado.
do $
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename  = 'site_settings'
  ) then
    alter publication supabase_realtime add table public.site_settings;
  end if;
exception when others then
  raise notice 'No se pudo agregar site_settings a supabase_realtime (%): el tema va a funcionar igual, pero las pestañas abiertas necesitan recargar.', sqlerrm;
end $;

-- ─── 4) Seed ────────────────────────────────────────────────────────────────
-- Arranca en 'base': correr esta migración NO cambia cómo se ve el sitio.
insert into public.site_settings (key, value)
values ('theme', 'base')
on conflict (key) do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- DESPUÉS de ejecutar esto:
--   · Panel admin → pestaña "Apariencia": ahí se prende y se apaga el tema.
--   · No hay validación del valor en la DB a propósito. El panel ofrece una
--     lista cerrada, así que un valor inválido sólo puede entrar por SQL a mano;
--     y el front ya ignora lo que no reconoce y cae en 'base'. Poner un CHECK
--     con los nombres de los temas acá obligaría a una migración cada vez que se
--     agrega uno, metiendo reglas de UN valor en una tabla genérica.
-- ════════════════════════════════════════════════════════════════════════════
