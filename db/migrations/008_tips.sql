-- Tip of the day (SPEC §15.60): for a signed-in user, which tips they've seen, the day of the last one, whether tips
-- are on, and how often they've used each feature by click and by key — what picks their tips. One row per user,
-- the state as the app keeps it (core/tips/tips.ts); merged with the browser's on every save. Gone with the account.
create table if not exists public.user_tips (
  user_id uuid primary key references neon_auth."user"(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);
