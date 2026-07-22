-- 0021_quickfire_queue_only.sql
-- "Just my questions": when true, a Quickfire session asks ONLY the pending
-- question queue and then wraps up — no fallback into must-cover topics.
-- Default false preserves the shipped behavior (queue first, then topics).
-- An empty queue still falls back to topics either way, so a session can
-- never start with nothing to ask.

alter table series
  add column quickfire_queue_only boolean not null default false;
