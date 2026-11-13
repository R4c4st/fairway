-- Fairway — schéma Supabase
-- À coller dans Supabase > SQL Editor > New query, puis « Run ».

create extension if not exists pgcrypto;

-- Parcours partagés entre potes (données complètes en JSON : repères, trous, GPS greens)
create table if not exists public.courses (
  id text primary key,
  name text not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Parties
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,             -- code court d'invitation (ex. K7P2QX)
  course_id text not null,
  course jsonb not null,                 -- copie du parcours au moment de la partie
  tee text not null,
  mode text not null default '18',       -- '18' | 'front' | 'back'
  format text not null default 'stableford', -- 'stableford' | 'net' | 'brut' | 'match'
  play_date date not null default current_date,
  tee_time text,
  status text not null default 'open',   -- 'open' | 'done'
  created_by text,
  created_at timestamptz not null default now()
);

-- Joueurs d'une partie
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  device_id text,                        -- téléphone qui « possède » ce joueur
  name text not null,
  idx numeric,                           -- index FFG
  tee text,
  created_at timestamptz not null default now()
);
create index if not exists players_game on public.players(game_id);

-- Scores trou par trou
create table if not exists public.scores (
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  hole int not null check (hole between 1 and 18),
  strokes int check (strokes between 1 and 20),
  putts int check (putts between 0 and 10),
  pickup boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (player_id, hole)
);
create index if not exists scores_game on public.scores(game_id);

-- Sécurité : accès ouvert avec la clé publique (anon), sans compte. Quelqu'un qui a
-- l'adresse du projet ET la clé peut lire/écrire : suffisant pour des scores entre potes,
-- ne rien stocker de sensible ici.
alter table public.courses enable row level security;
alter table public.games   enable row level security;
alter table public.players enable row level security;
alter table public.scores  enable row level security;

drop policy if exists courses_all on public.courses;
create policy courses_all on public.courses for all to anon using (true) with check (true);

drop policy if exists games_rw on public.games;
create policy games_rw on public.games for all to anon using (true) with check (true);

drop policy if exists players_rw on public.players;
create policy players_rw on public.players for all to anon using (true) with check (true);

drop policy if exists scores_rw on public.scores;
create policy scores_rw on public.scores for all to anon using (true) with check (true);

-- Temps réel : diffusion des changements de scores et de joueurs
do $$ begin
  begin alter publication supabase_realtime add table public.scores;  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.players; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.games;   exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.courses; exception when duplicate_object then null; end;
end $$;

-- ===== v2 : profils, partenaires, moments forts =====

-- Profil créé à la 1re installation (1 par téléphone), récupérable avec son code
create table if not exists public.profiles (
  device_id text primary key,
  code text unique,
  name text,
  idx numeric,
  tee text,
  bag jsonb,
  partners jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists profiles_rw on public.profiles;
create policy profiles_rw on public.profiles for all to anon using (true) with check (true);

-- Moments forts d'une partie : beaux coups, « pas passé les rouges »
create table if not exists public.events (
  id uuid primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid references public.players(id) on delete cascade,
  type text not null,          -- birdie, eagle, drive, approche, putt, ..., rouge
  label text,
  hole int,
  by_name text,
  created_at timestamptz not null default now()
);
create index if not exists events_game on public.events(game_id);
alter table public.events enable row level security;
drop policy if exists events_rw on public.events;
create policy events_rw on public.events for all to anon using (true) with check (true);

do $$ begin
  begin alter publication supabase_realtime add table public.events;   exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.profiles; exception when duplicate_object then null; end;
end $$;

-- Nécessaire pour recevoir les suppressions en temps réel (ex. annulation « rouges »)
alter table public.events replica identity full;
alter table public.scores replica identity full;

-- Droits d'accès explicites pour l'appli (utile si « Automatically expose new tables » est décoché)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.courses, public.games, public.players, public.scores, public.profiles, public.events to anon, authenticated;

-- Recharge le cache de l'API pour que les nouvelles tables soient visibles tout de suite
notify pgrst, 'reload schema';

-- ===== v3 : sauvegarde automatique =====
create table if not exists public.backups (
  device_id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.backups enable row level security;
drop policy if exists backups_rw on public.backups;
create policy backups_rw on public.backups for all to anon using (true) with check (true);
grant select, insert, update, delete on public.backups to anon, authenticated;
notify pgrst, 'reload schema';
