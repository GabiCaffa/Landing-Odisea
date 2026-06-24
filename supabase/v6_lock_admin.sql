-- ════════════════════════════════════════════════════════════════════════════
-- ODÍSEA · v6 · Cuenta admin única e inmutable (lisoftuy@gmail.com)
-- ════════════════════════════════════════════════════════════════════════════
-- Pegar y ejecutar en: Supabase Dashboard → SQL Editor → New query.
-- Idempotente: se puede ejecutar varias veces sin romper nada.
--
-- Garantiza a nivel de base de datos (no se puede saltear desde el panel):
--   1) SOLO lisoftuy@gmail.com puede tener role = 'admin'.
--   2) El rol de lisoftuy@gmail.com no se puede cambiar (siempre 'admin').
--   3) El perfil de lisoftuy@gmail.com no se puede eliminar.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Trigger: forzar admin único en INSERT/UPDATE ────────────────────────────
create or replace function public.enforce_unique_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(new.email) = 'lisoftuy@gmail.com' then
    new.role := 'admin';   -- el admin oficial siempre es admin (no se puede degradar)
  elsif new.role = 'admin' then
    new.role := 'user';    -- nadie más puede ser admin
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_unique_admin on public.profiles;
create trigger trg_enforce_unique_admin
  before insert or update on public.profiles
  for each row execute function public.enforce_unique_admin();

-- ─── Trigger: bloquear borrado del admin oficial ─────────────────────────────
create or replace function public.prevent_admin_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(old.email) = 'lisoftuy@gmail.com' then
    raise exception 'La cuenta admin oficial no se puede eliminar';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_prevent_admin_delete on public.profiles;
create trigger trg_prevent_admin_delete
  before delete on public.profiles
  for each row execute function public.prevent_admin_delete();

-- ─── Reconciliar el estado actual ────────────────────────────────────────────
-- Asegura que lisoftuy@gmail.com sea admin y degrada cualquier otro admin.
-- (Los triggers de arriba corrigen igual, pero esto deja el estado consistente ya.)
update public.profiles set role = 'admin' where lower(email) = 'lisoftuy@gmail.com';
update public.profiles set role = 'user'  where lower(email) <> 'lisoftuy@gmail.com' and role = 'admin';
