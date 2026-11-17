-- A signed-in user's own threads and beads (SPEC §15.28): one row each, the same shape as a pattern's custom colour
-- (`customs` in the .xbird file), so a pattern's copy and the inventory share an id. Gone with the account.
create table if not exists public.threads (
  user_id uuid not null references neon_auth."user"(id) on delete cascade,
  id text not null,
  kind text not null check (kind in ('thread', 'bead')),
  brand text not null,
  code text not null,
  name text not null,
  hex text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists threads_by_user_brand on public.threads (user_id, brand);
