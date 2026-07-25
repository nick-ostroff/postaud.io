-- Manual ordering for the series grids (home, /app/series, mobile rail).
-- Lower sort_order shows first. Everything defaults to 0, so until someone
-- drags, ties fall back to the old order (created_at desc). A drag rewrites
-- 0..N-1 across the visible set; a series created afterwards defaults to 0
-- and — being newest among the ties at 0 — lands on top, same as before.
alter table series add column sort_order integer not null default 0;
