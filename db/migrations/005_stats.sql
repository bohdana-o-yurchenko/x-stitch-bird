-- The patterns list (SPEC §15.36) shows each pattern's figures (colours, stitches, time spent…) without loading the
-- pattern: they are worked out at every save. Null for patterns saved before; filled in when first listed.
alter table public.patterns add column if not exists stats jsonb;
