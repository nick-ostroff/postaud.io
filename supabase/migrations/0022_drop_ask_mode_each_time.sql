-- 0022_drop_ask_mode_each_time.sql
-- The pre-talk "How do you want to talk today?" chooser is gone — the
-- conversation mode now comes only from series settings (with the queue page's
-- explicit ?mode= override). The ask-each-time flag has nothing to drive.

alter table series
  drop column ask_mode_each_time;
