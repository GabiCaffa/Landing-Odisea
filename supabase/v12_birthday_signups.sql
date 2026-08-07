  -- ════════════════════════════════════════════════════════════════════════════
  -- ODÍSEA · v12: Promo cumpleaños (carga de staff) + foto de cédula privada
  -- ════════════════════════════════════════════════════════════════════════════
  -- Registro de los cumpleañeros que acceden al beneficio. Los carga el staff
  -- (admin u operador) desde el panel; la persona puede ser un usuario registrado
  -- (se copian los datos de su perfil) o alguien de afuera (carga manual).
  --
  -- Se guarda UNA foto del frente del documento para verificar identidad/edad.
  -- La foto va a un bucket PRIVADO ('id-photos'): es un documento de identidad,
  -- así que NO puede quedar accesible por URL pública como las fotos de eventos.
  -- El panel la muestra con URLs firmadas de corta duración (ver src/lib/birthdays.ts).
  --
  -- Mayoría de edad: se valida en el front y TAMBIÉN acá con un trigger, para que
  -- no entre un menor por más que alguien saltee la UI.
  --
  -- Pegar en: Supabase Dashboard → SQL Editor → New query. Idempotente.
  -- ════════════════════════════════════════════════════════════════════════════

  -- ─── Tabla ──────────────────────────────────────────────────────────────────
  create table if not exists public.birthday_signups (
    id            uuid primary key default gen_random_uuid(),
    -- Evento OPCIONAL: se puede cargar el cumple antes de saber a qué fiesta va.
    -- on delete set null: borrar el evento no borra al cumpleañero, sólo el vínculo.
    event_id      uuid references public.events(id) on delete set null,
    -- Si es un usuario registrado, su perfil (los datos igual quedan copiados acá).
    user_id       uuid references public.profiles(id) on delete set null,
    first_name    text not null,
    last_name     text not null,
    document_id   text not null,             -- sólo dígitos (cédula/DNI/etc.)
    birth_date    date not null,             -- fecha de nacimiento (define el cumple)
    email         text,
    phone         text,                      -- E.164
    country       text,                      -- ISO 3166-1 alpha-2
    state         text,
    -- Ruta del archivo dentro del bucket privado 'id-photos' (no una URL pública).
    id_photo_path text,
    gift_given    boolean not null default false,
    gift_given_at timestamptz,
    notes         text,
    created_by    uuid references auth.users(id) on delete set null,
    created_at    timestamptz not null default now()
  );

  create index if not exists birthdays_event_idx    on public.birthday_signups(event_id);
  create index if not exists birthdays_user_idx     on public.birthday_signups(user_id);
  create index if not exists birthdays_gift_idx     on public.birthday_signups(gift_given);
  create index if not exists birthdays_created_idx  on public.birthday_signups(created_at desc);
  -- Para detectar cargas repetidas de la misma persona (aviso en la UI, no bloqueo).
  create index if not exists birthdays_document_idx on public.birthday_signups(lower(document_id));

  -- ─── Mayoría de edad (18+) ──────────────────────────────────────────────────
  -- Va como trigger y no como CHECK porque un CHECK con current_date no es
  -- inmutable (rompería dump/restore y se evaluaría al restaurar la base).
  create or replace function public.enforce_birthday_signup_adult()
  returns trigger
  language plpgsql
  as $$
  begin
    if new.birth_date > (current_date - interval '18 years')::date then
      raise exception 'El cumpleañero debe ser mayor de 18 años (fecha de nacimiento %)',
        new.birth_date using errcode = 'check_violation';
    end if;
    return new;
  end;
  $$;

  drop trigger if exists birthday_signups_adult on public.birthday_signups;
  create trigger birthday_signups_adult
    before insert or update of birth_date on public.birthday_signups
    for each row execute function public.enforce_birthday_signup_adult();

  -- ─── Coherencia del toggle de regalo ────────────────────────────────────────
  -- gift_given = true  → sella gift_given_at (si no vino seteado)
  -- gift_given = false → limpia gift_given_at
  create or replace function public.sync_birthday_gift_timestamp()
  returns trigger
  language plpgsql
  as $$
  begin
    if new.gift_given then
      if new.gift_given_at is null then
        new.gift_given_at := now();
      end if;
    else
      new.gift_given_at := null;
    end if;
    return new;
  end;
  $$;

  drop trigger if exists birthday_signups_gift_ts on public.birthday_signups;
  create trigger birthday_signups_gift_ts
    before insert or update of gift_given on public.birthday_signups
    for each row execute function public.sync_birthday_gift_timestamp();

  -- ─── RLS: sólo staff (admin u operador) ─────────────────────────────────────
  alter table public.birthday_signups enable row level security;

  drop policy if exists "birthdays_select_staff" on public.birthday_signups;
  drop policy if exists "birthdays_insert_staff" on public.birthday_signups;
  drop policy if exists "birthdays_update_staff" on public.birthday_signups;
  drop policy if exists "birthdays_delete_staff" on public.birthday_signups;

  create policy "birthdays_select_staff" on public.birthday_signups
    for select using (public.is_staff());
  create policy "birthdays_insert_staff" on public.birthday_signups
    for insert with check (public.is_staff());
  create policy "birthdays_update_staff" on public.birthday_signups
    for update using (public.is_staff()) with check (public.is_staff());
  create policy "birthdays_delete_staff" on public.birthday_signups
    for delete using (public.is_staff());

  -- ─── STORAGE: bucket PRIVADO para las fotos de documento ────────────────────
  -- public = false → no hay URL pública; se accede sólo con URL firmada y con
  -- sesión de staff (Ley de protección de datos: es un documento de identidad).
  insert into storage.buckets (id, name, public)
  values ('id-photos', 'id-photos', false)
  on conflict (id) do update set public = false;

  drop policy if exists "id_photos_select_staff" on storage.objects;
  drop policy if exists "id_photos_insert_staff" on storage.objects;
  drop policy if exists "id_photos_update_staff" on storage.objects;
  drop policy if exists "id_photos_delete_staff" on storage.objects;

  create policy "id_photos_select_staff" on storage.objects
    for select using (bucket_id = 'id-photos' and public.is_staff());
  create policy "id_photos_insert_staff" on storage.objects
    for insert with check (bucket_id = 'id-photos' and public.is_staff());
  create policy "id_photos_update_staff" on storage.objects
    for update using (bucket_id = 'id-photos' and public.is_staff())
    with check (bucket_id = 'id-photos' and public.is_staff());
  create policy "id_photos_delete_staff" on storage.objects
    for delete using (bucket_id = 'id-photos' and public.is_staff());

  -- ════════════════════════════════════════════════════════════════════════════
