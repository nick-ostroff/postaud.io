-- 0023_simplify_series_settings.sql
-- Series settings simplification:
--   * Conversation type is Flow or Quickfire only — existing 'deep' series
--     become 'flow' (the enum value stays for historical interview rows).
--   * session_minutes becomes total_minutes: the TOTAL talk-time budget for
--     the whole series across sessions. Null = unlimited (the new default).
--     Existing per-session values carry over as the series total.

update series set conversation_mode = 'flow' where conversation_mode = 'deep';

alter table series
  alter column conversation_mode set default 'flow';

alter table series rename column session_minutes to total_minutes;

alter table series
  alter column total_minutes drop not null,
  alter column total_minutes set default null;
