-- Feature usage (SPEC §15.54): how often each feature is used, from a button (clicks) and from a shortcut (keys),
-- summed over all users per UTC day, signed in or not. Nothing about who used it. Each batch from a browser is one
-- upsert; a report is one sum over a range of days — the primary key serves both.
create table if not exists public.feature_usage (
  day date not null,
  feature text not null,
  signed_in boolean not null,
  clicks bigint not null default 0,
  keys bigint not null default 0,
  primary key (day, feature, signed_in)
);
