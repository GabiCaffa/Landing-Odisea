-- ════════════════════════════════════════════════════════════════════════════
-- ODÍSEA · v3: phone, country, state + promo cumpleaños con anti-abuso
-- ════════════════════════════════════════════════════════════════════════════
-- Pegar en: Supabase Dashboard → SQL Editor → New query. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Nuevas columnas en profiles ────────────────────────────────────────────
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists country text;
alter table public.profiles add column if not exists state text;

-- ─── Trigger: actualizado para leer también phone/country/state ─────────────
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
      (new.raw_user_meta_data->>'birth_date')::date,
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

-- ─── Tabla de claims de promo cumpleaños ────────────────────────────────────
create table if not exists public.birthday_promo_claims (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  event_id    uuid not null references public.events(id) on delete cascade,
  claimed_at  timestamptz not null default now(),
  unique (user_id, event_id)
);

create index if not exists claims_user_idx       on public.birthday_promo_claims(user_id);
create index if not exists claims_event_idx      on public.birthday_promo_claims(event_id);
create index if not exists claims_claimed_at_idx on public.birthday_promo_claims(claimed_at desc);

alter table public.birthday_promo_claims enable row level security;

drop policy if exists "claims_select_own"   on public.birthday_promo_claims;
drop policy if exists "claims_select_admin" on public.birthday_promo_claims;
drop policy if exists "claims_insert_own"   on public.birthday_promo_claims;

create policy "claims_select_own"   on public.birthday_promo_claims
  for select using (auth.uid() = user_id);
create policy "claims_select_admin" on public.birthday_promo_claims
  for select using (public.is_admin());
create policy "claims_insert_own"   on public.birthday_promo_claims
  for insert with check (auth.uid() = user_id);

-- ─── RPC: chequear si el user puede reclamar promo de cumple ────────────────
-- Cooldown de 90 días entre claims + match del cumple con la fecha del evento (±15d)
create or replace function public.can_claim_birthday_promo(target_event uuid)
returns table (
  can_claim boolean,
  reason text,
  next_available date
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_birth date;
  v_event_date date;
  v_last_claim timestamptz;
  v_window int := 15;
  v_cooldown int := 90;
  v_birth_this_year date;
  v_diff int;
begin
  if v_uid is null then
    return query select false, 'no_auth', null::date;
    return;
  end if;

  select birth_date into v_birth from public.profiles where id = v_uid;
  if v_birth is null then
    return query select false, 'no_birth_date', null::date;
    return;
  end if;

  select date into v_event_date from public.events where id = target_event;
  if v_event_date is null then
    return query select false, 'no_event', null::date;
    return;
  end if;

  -- Cumple en el año del evento
  v_birth_this_year := make_date(
    extract(year from v_event_date)::int,
    extract(month from v_birth)::int,
    extract(day from v_birth)::int
  );
  v_diff := abs((v_event_date - v_birth_this_year));

  if v_diff > v_window then
    return query select false, 'birthday_too_far', null::date;
    return;
  end if;

  -- Cooldown
  select max(claimed_at) into v_last_claim
  from public.birthday_promo_claims
  where user_id = v_uid;

  if v_last_claim is not null and v_last_claim > (now() - (v_cooldown || ' days')::interval) then
    return query select false, 'cooldown',
      (v_last_claim + (v_cooldown || ' days')::interval)::date;
    return;
  end if;

  -- Ya reclamó para este evento puntual
  if exists (
    select 1 from public.birthday_promo_claims
    where user_id = v_uid and event_id = target_event
  ) then
    return query select false, 'already_claimed', null::date;
    return;
  end if;

  return query select true, 'ok', null::date;
end;
$$;

grant execute on function public.can_claim_birthday_promo(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
