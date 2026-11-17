-- One pattern open in several windows or devices (SPEC §15.34). `rev` counts the saves of the pattern, so a save made
-- over an older one is refused instead of replacing it unseen. One window edits at a time (`editor`, alive while
-- `editor_at` is recent); the others follow its changes. `handoff_from`: the window that was editing when another
-- took over, until it has saved what it had.
alter table public.patterns add column if not exists rev integer not null default 0;
alter table public.patterns add column if not exists editor text;
alter table public.patterns add column if not exists editor_at timestamptz;
alter table public.patterns add column if not exists handoff_from text;

-- The windows that have the pattern open, as they last checked in.
create table if not exists public.pattern_windows (
  user_id uuid not null,
  pattern_id text not null,
  window_id text not null,
  seen_at timestamptz not null default now(),
  primary key (user_id, pattern_id, window_id),
  foreign key (user_id, pattern_id) references public.patterns (user_id, id) on delete cascade
);

-- The pattern's versions (automatic snapshots), from every device: each browser's history joins the others'. `doc` is
-- the pattern file as it was then, gzip-compressed.
create table if not exists public.pattern_versions (
  user_id uuid not null,
  pattern_id text not null,
  time bigint not null,
  reason text not null,
  doc bytea not null,
  primary key (user_id, pattern_id, time),
  foreign key (user_id, pattern_id) references public.patterns (user_id, id) on delete cascade
);
