-- ════════════════════════════════════════════════════════════════════════════
-- v35 — Votación de disfraces (concurso con fotos)
-- ════════════════════════════════════════════════════════════════════════════
--
-- El staff carga las fotos de la gente disfrazada y la gente vota desde la
-- web. Hay premios, así que lo que importa es que **no se pueda hacer trampa
-- fácil**: ésa es la razón de casi todas las decisiones de abajo.
--
-- ─── Quién vota: sólo con cuenta, un voto por persona ───────────────────────
-- Votar exige sesión iniciada Y perfil creado. El perfil sólo existe cuando el
-- email se confirmó (v7), así que una dirección inventada no vota. La clave de
-- `contest_votes` es (concurso, usuario): **la base impide votar dos veces**,
-- no el front. Se puede CAMBIAR el voto mientras el concurso esté abierto.
--
-- ─── Nadie escribe votos directo ────────────────────────────────────────────
-- `contest_votes` no tiene política de insert/update: se vota únicamente por
-- `cast_vote()`, que valida todo adentro (sesión, perfil, que la foto exista y
-- esté activa, que el concurso esté abierto y no haya pasado su cierre). Si el
-- front tuviera permiso de insertar, cualquiera podría votar por otro o
-- saltarse el cierre desde la consola.
--
-- ─── Los conteos son públicos (decisión del autor: contador en vivo) ────────
-- `contest_results()` devuelve cuántos votos tiene cada foto, sin exponer QUIÉN
-- votó: cada usuario sólo puede leer su propio voto.
--
-- ─── Las fotos van al bucket `gallery` (v33), carpeta `disfraces/` ──────────
-- Ya es público y el staff ya puede subir y borrar: no hace falta nada nuevo.
--
-- Estados: draft (sólo staff) → open (se vota) → closed (se ve el podio).
-- Idempotente. Pegar en el SQL Editor de Supabase.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1) Tablas ──────────────────────────────────────────────────────────────
create table if not exists public.contests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  -- Opcional. Pasado este momento no se acepta ningún voto más, aunque el
  -- estado siga en 'open' (nadie tiene que acordarse de cerrarlo a mano).
  closes_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.contest_entries (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests(id) on delete cascade,
  photo_url text not null,
  -- Lo que se ve bajo la foto: un nombre, un @ de Instagram, "Disfraz #12".
  label text not null default '',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists contest_entries_concurso_idx
  on public.contest_entries(contest_id, sort_order);

create table if not exists public.contest_votes (
  contest_id uuid not null references public.contests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_id uuid not null references public.contest_entries(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- UN voto por persona y concurso.
  primary key (contest_id, user_id)
);

create index if not exists contest_votes_entry_idx on public.contest_votes(entry_id);

-- ─── 2) RLS ─────────────────────────────────────────────────────────────────
alter table public.contests enable row level security;
alter table public.contest_entries enable row level security;
alter table public.contest_votes enable row level security;

-- Concursos: el público ve los que no son borrador; el staff, todos.
drop policy if exists contests_select on public.contests;
create policy contests_select on public.contests for select
  using (status <> 'draft' or public.is_manager());

drop policy if exists contests_write_manager on public.contests;
create policy contests_write_manager on public.contests for all
  using (public.is_manager()) with check (public.is_manager());

-- Fotos: el público ve las activas de concursos que no son borrador.
drop policy if exists contest_entries_select on public.contest_entries;
create policy contest_entries_select on public.contest_entries for select
  using (
    public.is_manager()
    or (active and exists (
      select 1 from public.contests c
      where c.id = contest_id and c.status <> 'draft'
    ))
  );

drop policy if exists contest_entries_write_manager on public.contest_entries;
create policy contest_entries_write_manager on public.contest_entries for all
  using (public.is_manager()) with check (public.is_manager());

-- Votos: cada quien lee SÓLO el suyo (para marcar "tu voto"). Sin insert ni
-- update: se vota por cast_vote(). El staff puede borrar votos (anti-fraude).
drop policy if exists contest_votes_select_own on public.contest_votes;
create policy contest_votes_select_own on public.contest_votes for select
  using (user_id = auth.uid() or public.is_manager());

drop policy if exists contest_votes_delete_manager on public.contest_votes;
create policy contest_votes_delete_manager on public.contest_votes for delete
  using (public.is_manager());

-- ─── 3) Votar ───────────────────────────────────────────────────────────────
create or replace function public.cast_vote(p_entry uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contest uuid;
  v_status text;
  v_closes timestamptz;
begin
  if auth.uid() is null then
    raise exception 'login_required' using errcode = '28000';
  end if;

  -- El perfil sólo existe con el email confirmado (v7).
  if not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'profile_required' using errcode = '28000';
  end if;

  select e.contest_id, c.status, c.closes_at
    into v_contest, v_status, v_closes
    from public.contest_entries e
    join public.contests c on c.id = e.contest_id
   where e.id = p_entry and e.active;

  if v_contest is null then
    raise exception 'entry_not_found' using errcode = 'P0002';
  end if;

  if v_status <> 'open' or (v_closes is not null and now() >= v_closes) then
    raise exception 'voting_closed' using errcode = '55000';
  end if;

  insert into public.contest_votes (contest_id, user_id, entry_id)
  values (v_contest, auth.uid(), p_entry)
  on conflict (contest_id, user_id)
  do update set entry_id = excluded.entry_id, updated_at = now();
end;
$$;

revoke all on function public.cast_vote(uuid) from public, anon;
grant execute on function public.cast_vote(uuid) to authenticated;

-- ─── 4) Conteos (públicos, sin decir quién votó) ────────────────────────────
create or replace function public.contest_results(p_contest uuid)
returns table (entry_id uuid, votes bigint)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, count(v.user_id)
    from public.contest_entries e
    left join public.contest_votes v on v.entry_id = e.id
   where e.contest_id = p_contest
     and e.active
     and exists (
       select 1 from public.contests c
        where c.id = p_contest and (c.status <> 'draft' or public.is_manager())
     )
   group by e.id;
$$;

grant execute on function public.contest_results(uuid) to anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- Verificación
-- ════════════════════════════════════════════════════════════════════════════
--   select table_name from information_schema.tables
--    where table_schema = 'public' and table_name like 'contest%';
--   select proname from pg_proc where proname in ('cast_vote', 'contest_results');
-- ════════════════════════════════════════════════════════════════════════════
