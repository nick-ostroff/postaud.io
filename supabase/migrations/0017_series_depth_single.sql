-- 0017_series_depth_single.sql
-- Adds a fourth series_depth value: 'single' — one question, one answer, no
-- follow-ups — so a series can collect information Q&A-style instead of as a
-- mined conversation. Placed before 'light' so the enum reads shallow → deep.
-- Additive only; existing rows keep their current depth.

alter type series_depth add value if not exists 'single' before 'light';
