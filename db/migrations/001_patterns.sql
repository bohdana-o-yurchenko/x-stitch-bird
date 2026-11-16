-- A signed-in user's saved patterns (SPEC §15.23). One row per pattern, the whole .xbird file in `doc`;
-- the Open dialog / gallery read only the small columns. Gone with the account.
create table if not exists public.patterns (
  user_id uuid not null references neon_auth."user"(id) on delete cascade,
  id text not null,
  name text not null,
  w integer not null,
  h integer not null,
  designer text,
  doc jsonb not null,
  -- key of the preview picture in the "assets" bucket, if one was uploaded
  preview_key text,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists patterns_by_user_recent on public.patterns (user_id, updated_at desc);
