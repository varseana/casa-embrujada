-- ============================================================================
-- Casa Embrujada :: migracion aditiva sobre el proyecto Supabase compartido
-- (el mismo de Juntos por Akira y Desfile de Faroles).
-- TODO es aditivo y aislado en el schema `embrujada`: NO toca `public` (Akira)
-- ni `faroles`. Seguro de correr en prod. Idempotente (se puede re-ejecutar).
-- Ejecutar en: Supabase Dashboard > SQL Editor (una sola vez).
-- ============================================================================

-- 1. Schema aislado ----------------------------------------------------------
create schema if not exists embrujada;

-- 2. Personajes (cada uno = PNG recortado de un colaborador disfrazado) -------
--    storage_path = HD en el bucket; thumb_path = miniatura (sprite que camina).
create table if not exists embrujada.characters (
  id           uuid primary key default gen_random_uuid(),
  name         text,
  storage_path text        not null,
  thumb_path   text,
  created_at   timestamptz not null default now()
);
create index if not exists characters_created_idx on embrujada.characters (created_at);

-- 3. Admins de la casa (independientes de Akira y de faroles) ----------------
create table if not exists embrujada.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- 4. RLS ----------------------------------------------------------------------
alter table embrujada.characters enable row level security;
alter table embrujada.admins     enable row level security;

drop policy if exists characters_public_read on embrujada.characters;
create policy characters_public_read on embrujada.characters
  for select using (true);

drop policy if exists characters_admin_write on embrujada.characters;
create policy characters_admin_write on embrujada.characters
  for all
  using     (exists (select 1 from embrujada.admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from embrujada.admins a where a.user_id = auth.uid()));

drop policy if exists admins_self_read on embrujada.admins;
create policy admins_self_read on embrujada.admins
  for select using (user_id = auth.uid());

-- 5. Grants -------------------------------------------------------------------
grant usage on schema embrujada to anon, authenticated;
grant select                 on embrujada.characters to anon, authenticated;
grant insert, update, delete on embrujada.characters to authenticated;
grant select                 on embrujada.admins     to authenticated;

-- 6. Storage: bucket publico exclusivo, solo imagenes, max 8 MB ---------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('embrujada-personajes', 'embrujada-personajes', true, 8388608,
        array['image/webp', 'image/png'])
on conflict (id) do nothing;

drop policy if exists embrujada_obj_read on storage.objects;
create policy embrujada_obj_read on storage.objects
  for select using (bucket_id = 'embrujada-personajes');

drop policy if exists embrujada_obj_write on storage.objects;
create policy embrujada_obj_write on storage.objects
  for all
  using (
    bucket_id = 'embrujada-personajes'
    and exists (select 1 from embrujada.admins a where a.user_id = auth.uid())
  )
  with check (
    bucket_id = 'embrujada-personajes'
    and exists (select 1 from embrujada.admins a where a.user_id = auth.uid())
  );

-- 7. Admin: el mismo usuario que ya administra faroles ------------------------
insert into embrujada.admins (user_id)
values ('1569d14e-6ad3-42e3-aa99-260d58ce8491')
on conflict do nothing;

-- ============================================================================
-- DESPUES DE CORRER ESTO:
--   Supabase > Project Settings > API > "Exposed schemas": agrega `embrujada`
--   (sin quitar `public` ni `faroles`).
-- ============================================================================
