-- 0025_ritual_mode.sql
-- New conversation type 'ritual': the interviewer asks the SAME queue
-- questions every session, in order — a daily journal / recurring check-in.
-- Unlike quickfire, a ritual session never consumes queue rows: they stay
-- 'pending' so the next entry asks the identical list again. Enforcement
-- lives in the app (the live session skips markAsked, and the queue API
-- refuses markAsked for ritual series) — no schema change beyond the value.
alter type conversation_mode add value if not exists 'ritual';
