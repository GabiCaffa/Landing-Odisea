-- ════════════════════════════════════════════════════════════════════════════
-- ODÍSEA · v11: rol "operador" (staff que sólo gestiona Entregas)
-- ════════════════════════════════════════════════════════════════════════════
-- Un operador puede entrar al panel pero SÓLO ve/gestiona el módulo Entregas.
-- No puede tocar eventos, usuarios ni nada de admin. El admin sigue siendo único
-- (lisoftuy@gmail.com); "operador" es un rol intermedio entre user y admin.
--
-- Pegar en: Supabase Dashboard → SQL Editor → New query. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Permitir el nuevo valor en el CHECK de role.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('user', 'admin', 'operador'));

-- 2) Helper: ¿es staff? (admin u operador). SECURITY DEFINER como is_admin().
create or replace function public.is_staff()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'operador')
  );
$$;

-- 3) Entregas: acceso para staff (admin u operador), no sólo admin.
drop policy if exists "deliveries_select_admin" on public.ticket_deliveries;
drop policy if exists "deliveries_insert_admin" on public.ticket_deliveries;
drop policy if exists "deliveries_update_admin" on public.ticket_deliveries;
drop policy if exists "deliveries_delete_admin" on public.ticket_deliveries;
drop policy if exists "deliveries_select_staff" on public.ticket_deliveries;
drop policy if exists "deliveries_insert_staff" on public.ticket_deliveries;
drop policy if exists "deliveries_update_staff" on public.ticket_deliveries;
drop policy if exists "deliveries_delete_staff" on public.ticket_deliveries;

create policy "deliveries_select_staff" on public.ticket_deliveries
  for select using (public.is_staff());
create policy "deliveries_insert_staff" on public.ticket_deliveries
  for insert with check (public.is_staff());
create policy "deliveries_update_staff" on public.ticket_deliveries
  for update using (public.is_staff()) with check (public.is_staff());
create policy "deliveries_delete_staff" on public.ticket_deliveries
  for delete using (public.is_staff());

-- 4) profiles: el staff puede LEER perfiles (para el selector de "cliente
--    registrado" en Entregas). Modificar/borrar perfiles sigue siendo sólo admin.
drop policy if exists "profiles_select_staff" on public.profiles;
create policy "profiles_select_staff" on public.profiles
  for select using (public.is_staff());

-- ════════════════════════════════════════════════════════════════════════════
