-- ============================================================================
-- Casa Embrujada :: puntajes del minijuego "Revienta los globos"
-- Migracion ADITIVA sobre el schema `embrujada` (ya creado por embrujada.sql).
-- No toca `public` (Akira) ni `faroles`. Idempotente (se puede re-ejecutar).
-- Ejecutar en: Supabase Dashboard > SQL Editor (una sola vez).
-- ============================================================================

-- 1. Techo de puntaje posible para N cuartos limpiados --------------------------
--    Replica las reglas de src/game/engine.ts: por cuarto n hay min(5+2n,16)
--    globos, cada uno vale como maximo 100*(1+0.25n) * 3 (tamaño) * 2 (racha),
--    mas el bono de 250*(n+1) al limpiarlo. Se suma tambien el cuarto donde
--    termino la partida (globos reventados sin limpiarlo). Es un techo generoso:
--    solo frena puntajes imposibles enviados a mano, no a quien juega bien.
create or replace function embrujada.max_score(rooms integer)
returns bigint
language plpgsql
immutable
as $$
declare
  total bigint := 0;
  n integer;
begin
  for n in 0..rooms loop
    total := total
      + least(5 + 2 * n, 16) * ceil(100 * (1 + 0.25 * n) * 3 * 2)::bigint
      + 250 * (n + 1);
  end loop;
  return total;
end;
$$;

-- 2. Partidas -------------------------------------------------------------------
--    alias = login de Amazon (minusculas y numeros). Una fila por partida; el
--    leaderboard toma el mejor puntaje de cada alias.
create table if not exists embrujada.scores (
  id         uuid primary key default gen_random_uuid(),
  alias      text        not null,
  score      integer     not null,
  rooms      integer     not null,
  created_at timestamptz not null default now(),
  constraint scores_alias_format check (alias ~ '^[a-z][a-z0-9]{1,19}$'),
  constraint scores_rooms_range  check (rooms between 0 and 200),
  constraint scores_score_range  check (score >= 0 and score <= embrujada.max_score(rooms))
);
create index if not exists scores_alias_score_idx on embrujada.scores (alias, score desc);

-- 3. RLS: cualquiera lee y registra su partida; nadie edita ni borra ------------
alter table embrujada.scores enable row level security;

drop policy if exists scores_public_read on embrujada.scores;
create policy scores_public_read on embrujada.scores
  for select using (true);

drop policy if exists scores_public_insert on embrujada.scores;
create policy scores_public_insert on embrujada.scores
  for insert with check (true);

-- los admins de la casa pueden limpiar puntajes (pruebas, alias mal escritos)
drop policy if exists scores_admin_delete on embrujada.scores;
create policy scores_admin_delete on embrujada.scores
  for delete using (exists (select 1 from embrujada.admins a where a.user_id = auth.uid()));

-- 4. Mejor puntaje por alias (lo que lee el leaderboard del hall) ----------------
create or replace view embrujada.best_scores
with (security_invoker = true) as
select distinct on (alias) alias, score, rooms, created_at
from embrujada.scores
order by alias, score desc, created_at asc;

-- 5. Grants -----------------------------------------------------------------------
grant select, insert on embrujada.scores      to anon, authenticated;
grant delete         on embrujada.scores      to authenticated;
grant select         on embrujada.best_scores to anon, authenticated;
grant execute on function embrujada.max_score(integer) to anon, authenticated;
