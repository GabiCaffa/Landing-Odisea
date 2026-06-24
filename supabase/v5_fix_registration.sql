-- ════════════════════════════════════════════════════════════════════════════
-- ODÍSEA · v5 · Reparación del registro ("Database error saving new user")
-- ════════════════════════════════════════════════════════════════════════════
-- Pegar y ejecutar en: Supabase Dashboard → SQL Editor → New query.
-- Idempotente: se puede ejecutar varias veces sin romper nada.
--
-- Deja consistente todo el circuito de registro: columnas del perfil, la función
-- que crea el perfil al registrarse, el trigger que la dispara, y las RPC que usa
-- el frontend. Resuelve el error "Database error saving new user".
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Columnas que el registro necesita en profiles
alter table public.profiles add column if not exists phone   text;
alter table public.profiles add column if not exists country text;
alter table public.profiles add column if not exists state   text;

-- 2) Función que crea el perfil a partir de la metadata del signUp
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.raw_user_meta_data ? 'first_name' then
    insert into public.profiles (
      id, email, first_name, last_name, birth_date, document_id,
      phone, country, state
    )
    values (
      new.id,
      new.email,
      new.raw_user_meta_data->>'first_name',
      new.raw_user_meta_data->>'last_name',
      nullif(new.raw_user_meta_data->>'birth_date', '')::date,
      new.raw_user_meta_data->>'document_id',
      new.raw_user_meta_data->>'phone',
      new.raw_user_meta_data->>'country',
      new.raw_user_meta_data->>'state'
    )
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

-- 3) Trigger que dispara la función al crearse un usuario en auth.users
--    (esto era lo que faltaba en los .sql del repo)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4) RPC: verificar cédula/documento antes de registrar (la usa el front, como anon)
create or replace function public.document_id_exists(doc text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.profiles where document_id = doc);
$$;
grant execute on function public.document_id_exists(text) to anon, authenticated;

-- 5) RPC: borrar la propia cuenta (la usa la página de perfil)
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;
grant execute on function public.delete_my_account() to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- Después de ejecutar: probá de nuevo crear una cuenta en /registro.
-- ════════════════════════════════════════════════════════════════════════════
