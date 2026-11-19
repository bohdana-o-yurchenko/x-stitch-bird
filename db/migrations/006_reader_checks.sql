-- "Does my app read it?" (SPEC §15.51): a signed-in user's checks of reader apps — the file checked (oxs, pk, pdf),
-- the app's name as typed, and the marks by sample id ({"dmc310": {"v": "ok"}, …}). Gone with the account.
create table if not exists public.reader_checks (
  user_id uuid not null references neon_auth."user"(id) on delete cascade,
  id text not null,
  kind text not null check (kind in ('oxs', 'pk', 'pdf')),
  app text not null,
  marks jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
