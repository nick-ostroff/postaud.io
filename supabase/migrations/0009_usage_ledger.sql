-- 0009: make interview_usage an append-only ledger.
--
-- Task usage-1's fix round 1: the review found two ways the prior
-- upsert-on-(interview_id,provider,phase) model silently misreported real
-- spend —
--   (a) a forced reprocess whose merge phase short-circuits (no existing
--       facts to compare against) leaves a *stale* 'merge' row from a prior
--       run that did call the model, because nothing overwrites it;
--   (b) a run that throws before mark-processed never persisted usage at
--       all (it was written only after a successful pipeline run), so a
--       real, billed API call (e.g. the extract call that then hit
--       NoFactsError) vanished from the ledger.
--
-- The fix: drop the unique constraint so `interview_usage` becomes an
-- append-only ledger for pipeline (anthropic) rows — every processing
-- attempt (success or failure) appends its own rows, and the true
-- cumulative spend is the SUM over all rows for an interview+phase, not the
-- most recent one. Realtime rows keep behaving like a single fact per
-- interview, but that's now enforced in application code (delete-then-insert
-- in the usage route) rather than by a DB constraint, since one conversation
-- still only ever posts one `openai_realtime` row.
alter table interview_usage
  drop constraint interview_usage_interview_id_provider_phase_key;

-- interview_id is still indexed (interview_usage_interview_id_idx from 0008)
-- for the per-interview reads/deletes the app does; no new index needed for
-- the ledger — summing all rows for an interview is already a cheap scan of
-- that few-row set.
