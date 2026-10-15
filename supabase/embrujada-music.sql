-- ============================================================================
-- Casa Embrujada :: musica del tocadiscos (aditivo sobre embrujada.sql)
-- Los MP3 NO van al repo (es publico): se suben por /admin a este bucket.
-- Aditivo, aislado en el schema `embrujada`, idempotente. No toca `public`
-- (Akira) ni `faroles`. Ejecutar en: Supabase Dashboard > SQL Editor.
-- ============================================================================

-- 1. Pistas: el orden lo define `position` (se reordena desde /admin) --------
create table if not exists embrujada.tracks (
  id           uuid primary key default gen_random_uuid(),
  title        text        not null,
  artist       text,
  storage_path text        not null,
  duration_s   integer,
  position     integer     not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists tracks_position_idx on embrujada.tracks (position, created_at);

-- 2. RLS: lectura publica (el tocadiscos), escritura solo admins de la casa --
alter table embrujada.tracks enable row level security;

drop policy if exists tracks_public_read on embrujada.tracks;
create policy tracks_public_read on embrujada.tracks
  for select using (true);

drop policy if exists tracks_admin_write on embrujada.tracks;
create policy tracks_admin_write on embrujada.tracks
  for all
  using     (exists (select 1 from embrujada.admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from embrujada.admins a where a.user_id = auth.uid()));

grant select                 on embrujada.tracks to anon, authenticated;
grant insert, update, delete on embrujada.tracks to authenticated;

-- 3. Storage: bucket exclusivo, solo MP3, max 20 MB --------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('embrujada-musica', 'embrujada-musica', true, 20971520,
        array['audio/mpeg', 'audio/mp3'])
on conflict (id) do nothing;

drop policy if exists embrujada_musica_read on storage.objects;
create policy embrujada_musica_read on storage.objects
  for select using (bucket_id = 'embrujada-musica');

drop policy if exists embrujada_musica_write on storage.objects;
create policy embrujada_musica_write on storage.objects
  for all
  using (
    bucket_id = 'embrujada-musica'
    and exists (select 1 from embrujada.admins a where a.user_id = auth.uid())
  )
  with check (
    bucket_id = 'embrujada-musica'
    and exists (select 1 from embrujada.admins a where a.user_id = auth.uid())
  );
