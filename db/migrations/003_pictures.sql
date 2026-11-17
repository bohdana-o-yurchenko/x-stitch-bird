-- Pictures in the account (SPEC §15.33): a pattern's photo windows and the image behind the chart go along with it.
-- The small records (window places, marks ids, underlay placement) sit on the pattern's row; `pictures_rev` counts
-- their changes, so a device that missed one can't overwrite it unseen.
alter table public.patterns add column if not exists refs jsonb;
alter table public.patterns add column if not exists underlay jsonb;
alter table public.patterns add column if not exists pictures_rev integer not null default 0;

-- The pictures themselves are in the "assets" bucket (users/<id>/pictures/<hash>), stored as they came, never
-- scaled down. A row here means the bucket has it; the id is the picture's content hash, so each is stored once.
create table if not exists public.pictures (
  user_id uuid not null references neon_auth."user"(id) on delete cascade,
  id text not null,
  size bigint not null,
  type text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
