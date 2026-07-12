-- 0007: close the TOCTOU window in the interview-start route's
-- reuse-or-insert: two concurrent POSTs from the same conductor could both
-- see "no in-progress interview" and both insert. This partial unique index
-- makes the second insert fail with 23505, which start.ts catches and
-- resolves by re-fetching the winner's row.
create unique index if not exists interviews_one_inprogress_per_conductor
  on interviews (series_id, conducted_by) where status = 'in_progress';
