-- 0011_series_voice_depth.sql
-- Per-series interviewer voice + persona, question depth, and an optional
-- planned-session target. All four defaults reproduce the pre-migration
-- behavior exactly (voice was hardcoded 'marin'/"Anna"; depth 'balanced'
-- matches the prompt as it stood), so no backfill is needed.

create type series_depth as enum ('light', 'balanced', 'deep');

alter table series
  add column voice            text         not null default 'marin',
  add column interviewer_name text         not null default 'Anna',
  add column depth            series_depth not null default 'balanced',
  add column planned_sessions int          null check (planned_sessions between 1 and 50);
