-- ════════════════════════════════════════════════════════════════════════════
-- ODÍSEA · v20: rol "cumples" (staff que SÓLO gestiona la promo de cumpleaños)
-- ════════════════════════════════════════════════════════════════════════════
-- Tercer rol de staff, al lado de "operador" (v11). Entra al panel y ve
-- ÚNICAMENTE la pestaña Cumpleaños: no ve Entregas —o sea, no ve las ventas,
-- los montos ni los datos de los compradores—, ni eventos, ni usuarios, ni
-- cuentas de cobro.
--
-- ── Por qué NO alcanza con agregarlo a is_staff() ──────────────────────────
-- is_staff() (v11) es lo que protege `ticket_deliveries`. Sumar el rol nuevo
-- ahí le abriría la recaudación entera de una, que es exactamente lo contrario
-- de lo que este rol existe para hacer. Por eso va una función aparte,
-- is_birthday_staff(), y is_staff() queda intacta.
--
--   is_staff()           → admin, operador            → Entregas
--   is_birthday_staff()  → admin, operador, cumples   → Cumpleaños + fotos
--
-- El operador queda incluido en la nueva porque HOY ya ve Cumpleaños
-- (OPERATOR_TABS en Admin.tsx): esta migración no le saca nada a nadie.
--
-- El candado del admin único (v6) no se toca: enforce_unique_admin() sólo
-- reescribe el rol cuando el email es el del admin oficial o cuando alguien
-- intenta ponerse 'admin', así que 'cumples' pasa sin que lo toque.
--
-- Pegar en: Supabase Dashboard → SQL Editor → New query. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Permitir el valor nuevo en el CHECK de role.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('user', 'admin', 'operador', 'cumples'));

-- 2) Helper: ¿puede gestionar cumpleaños? SECURITY DEFINER, igual que is_staff().
--    (Sin SECURITY DEFINER la función leería `profiles` con las políticas del
--    que consulta y se mordería la cola.)
create or replace function public.is_birthday_staff()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'operador', 'cumples')
  );
$$;

-- 3) birthday_signups: las políticas de STAFF pasan a la función nueva.
--    OJO: no se tocan birthdays_insert_own ni birthdays_select_own (v16), que
--    son las de autogestión del cliente registrado.
drop policy if exists "birthdays_select_staff" on public.birthday_signups;
drop policy if exists "birthdays_insert_staff" on public.birthday_signups;
drop policy if exists "birthdays_update_staff" on public.birthday_signups;
drop policy if exists "birthdays_delete_staff" on public.birthday_signups;

create policy "birthdays_select_staff" on public.birthday_signups
  for select using (public.is_birthday_staff());
create policy "birthdays_insert_staff" on public.birthday_signups
  for insert with check (public.is_birthday_staff());
create policy "birthdays_update_staff" on public.birthday_signups
  for update using (public.is_birthday_staff()) with check (public.is_birthday_staff());
create policy "birthdays_delete_staff" on public.birthday_signups
  for delete using (public.is_birthday_staff());

-- 4) Fotos de documento (bucket privado `id-photos`, v12).
--    Sin esto el rol nuevo ve la lista pero NO puede abrir la cédula, que es
--    justo una de las cosas para las que existe.
--    No se toca id_photos_insert_own (v16): el cliente sólo escribe en su carpeta.
drop policy if exists "id_photos_select_staff" on storage.objects;
drop policy if exists "id_photos_insert_staff" on storage.objects;
drop policy if exists "id_photos_update_staff" on storage.objects;
drop policy if exists "id_photos_delete_staff" on storage.objects;

create policy "id_photos_select_staff" on storage.objects
  for select using (bucket_id = 'id-photos' and public.is_birthday_staff());
create policy "id_photos_insert_staff" on storage.objects
  for insert with check (bucket_id = 'id-photos' and public.is_birthday_staff());
create policy "id_photos_update_staff" on storage.objects
  for update using (bucket_id = 'id-photos' and public.is_birthday_staff())
  with check (bucket_id = 'id-photos' and public.is_birthday_staff());
create policy "id_photos_delete_staff" on storage.objects
  for delete using (bucket_id = 'id-photos' and public.is_birthday_staff());

-- 5) profiles: el rol nuevo necesita LEER perfiles.
--    Es para el selector de "usuario registrado" del formulario de cumpleaños
--    (UserSearchSelect) y para mostrar el badge "Registrado". Va como política
--    APARTE en vez de modificar profiles_select_staff (v11): varias políticas
--    permisivas se combinan con OR, así que sumar una no le saca acceso a
--    nadie ni depende del orden en que se corran las migraciones.
--    Escribir y borrar perfiles sigue siendo sólo del admin.
drop policy if exists "profiles_select_birthday_staff" on public.profiles;
create policy "profiles_select_birthday_staff" on public.profiles
  for select using (public.is_birthday_staff());

-- ════════════════════════════════════════════════════════════════════════════
-- Para asignar el rol: panel → Usuarios → selector de rol. O a mano:
--   update public.profiles set role = 'cumples' where email = 'quien@sea.com';
-- ════════════════════════════════════════════════════════════════════════════
