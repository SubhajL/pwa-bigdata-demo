Verdict: not ready to claim S3 accepted. No CRITICAL findings, but four HIGH issues undermine the WebSocket isolation and judge-facing latency claim.

Line references use the current worktree, which contains additional `TwinEvent` fields beyond the pasted hunk.

## CRITICAL

None.

## HIGH

1. Idle WebSocket disconnects leak subscribers indefinitely.

   [routes/twin.py:31](/private/tmp/claude-501/-Users-subhajlimanond-dev-pwa-bigdata-demo/662ee5b1-ffb2-469f-a64f-7440f903b74b/scratchpad/wt-s3/api/app/routes/twin.py:31) only waits on `sub.get()` and never receives from the socket. If a client disconnects while telemetry is quiet, no `WebSocketDisconnect` is observed and `finally` never runs. Uvicorn records the disconnect for the next ASGI receive, but this handler never performs one.

   Repeated connect/disconnect cycles accumulate subscribers until another event happens.

   Existing false-green test: `test_unsubscribing_stops_delivery_and_frees_the_slot` manually unsubscribes; it does not disconnect a socket.

   Required failing test: `test_idle_socket_disconnect_unsubscribes_without_future_broadcast`, against live uvicorn.

2. `broadcast()` is per-queue bounded, but globally blocking.

   [ws.py:83](/private/tmp/claude-501/-Users-subhajlimanond-dev-pwa-bigdata-demo/662ee5b1-ffb2-469f-a64f-7440f903b74b/scratchpad/wt-s3/api/app/ws.py:83) copies and walks every subscriber synchronously on the sole event loop. There is no connection limit at [routes/twin.py:31](/private/tmp/claude-501/-Users-subhajlimanond-dev-pwa-bigdata-demo/662ee5b1-ffb2-469f-a64f-7440f903b74b/scratchpad/wt-s3/api/app/routes/twin.py:31). Leaked or hostile non-reading clients therefore make every accepted MQTT message O(N).

   Direct probe: one broadcast to 100,000 subscribers took approximately 43.4 ms. At ingest rate, that is event-loop starvation. A single failing socket is isolated; the accumulated population is how sockets reach back into ingest.

   Existing false-green test: `test_a_stalled_subscriber_cannot_slow_the_broadcaster` uses only two subscribers.

   Fix: enforce admission limits and reap disconnected clients; test a defined aggregate fan-out budget.

3. DLQ paging is neither stable nor bounded.

   [db.py:215](/private/tmp/claude-501/-Users-subhajlimanond-dev-pwa-bigdata-demo/662ee5b1-ffb2-469f-a64f-7440f903b74b/scratchpad/wt-s3/api/app/db.py:215) uses `LIMIT/OFFSET`. An insert between page requests shifts every offset, causing duplicates or skipped rows. Arbitrarily large offsets also require PostgreSQL to walk all preceding index entries. The new index removes sorting; it does not make deep offsets O(1).

   Existing false-green tests:

   - `test_recent_dead_letters_supports_paging` performs no concurrent insert.
   - `test_dlq_browse_query_is_indexed` only uses `OFFSET 0`.

   Fix: keyset pagination using `(created_at, id)` and a returned cursor, or impose a small maximum offset.

4. The item 1.3 test is preflight, not judge-facing acceptance evidence.

   [test_latency.py:58](/private/tmp/claude-501/-Users-subhajlimanond-dev-pwa-bigdata-demo/662ee5b1-ffb2-469f-a64f-7440f903b74b/scratchpad/wt-s3/api/tests/test_latency.py:58) explicitly disables MQTT. [test_latency.py:94](/private/tmp/claude-501/-Users-subhajlimanond-dev-pwa-bigdata-demo/662ee5b1-ffb2-469f-a64f-7440f903b74b/scratchpad/wt-s3/api/tests/test_latency.py:94) measures warmed loopback calls over one persistent connection.

   It excludes what a judge can encounter:

   - normal Compose topology and container networking;
   - live simulator/ingest load and pool contention;
   - cold cache and first browser request;
   - realistic Timescale chunk/table depth;
   - browser scheduling, proxy/TLS/CORS, if present;
   - an actual DevTools-visible arithmetic mean.

   The test also asserts only HTTP 200, so a fast endpoint returning the wrong asset or body still passes.

   Fix: call this “steady-state local preflight,” then capture 20 browser calls in the normal demo topology under live MQTT traffic.

## MEDIUM

5. The hub loses the newest state for individual assets.

   [ws.py:85](/private/tmp/claude-501/-Users-subhajlimanond-dev-pwa-bigdata-demo/662ee5b1-ffb2-469f-a64f-7440f903b74b/scratchpad/wt-s3/api/app/ws.py:85) retains the newest frames globally, not one newest frame per asset. A `P-1: critical` update can be evicted by 64 updates for other assets. The client then displays stale P-1 state forever because there is no snapshot/resynchronization protocol.

   `test_a_full_subscriber_queue_drops_the_OLDEST_frame` uses a different asset for every frame and therefore rewards this defect.

   Fix: coalesce queued status by `asset_id`, or require snapshot resynchronization after drops.

6. `latest_reading` has no total ordering.

   [db.py:207](/private/tmp/claude-501/-Users-subhajlimanond-dev-pwa-bigdata-demo/662ee5b1-ffb2-469f-a64f-7440f903b74b/scratchpad/wt-s3/api/app/db.py:207) orders only by device timestamp. Equal timestamps can return either row; multi-signal telemetry makes that plausible. It also lets one far-future device timestamp pin “latest” indefinitely.

   `test_latest_returns_the_newest_row_not_merely_a_row` uses unique, sane timestamps.

   Fix: add an ingestion sequence/time as a deterministic tie-breaker and enforce acceptable clock skew.

7. DLQ browsing changes the retained JSON payload.

   [db.py:259](/private/tmp/claude-501/-Users-subhajlimanond-dev-pwa-bigdata-demo/662ee5b1-ffb2-469f-a64f-7440f903b74b/scratchpad/wt-s3/api/app/db.py:259) rewrites any scalar, array, or JSON null into `{"value": original}` because `DeadLetter.raw` only accepts dictionaries. An original scalar and a genuine `{"value": ...}` object become indistinguishable.

   `test_recent_dead_letters_carries_reason_and_asset` only inserts a dictionary.

   Fix: model `raw` as arbitrary JSON or use an unambiguous typed envelope; test object, array, string, number, boolean, and null roots.

8. The EXPLAIN assertions overclaim “index seek.”

   [test_latency.py:193](/private/tmp/claude-501/-Users-subhajlimanond-dev-pwa-bigdata-demo/662ee5b1-ffb2-469f-a64f-7440f903b74b/scratchpad/wt-s3/api/tests/test_latency.py:193) accepts any plan containing `"Index"`, including bitmap index work followed by sorting. More bluntly, [test_latency.py:205](/private/tmp/claude-501/-Users-subhajlimanond-dev-pwa-bigdata-demo/662ee5b1-ffb2-469f-a64f-7440f903b74b/scratchpad/wt-s3/api/tests/test_latency.py:205) accepts any plan without `Sort`—including a sequential scan if `ORDER BY` is accidentally removed.

   Fix: parse JSON EXPLAIN and assert the intended ordered index/index-only scan and index name.

9. The new ACK matrix is not tested.

   Current `Disposition` behavior is correct: only `FAILED` is non-ackable. I found no actual ACK/retry regression.

   However, rejected and duplicate emission tests attach no MQTT client, and the transient-retry test also attaches none. These mutations remain green:

   - ACK only `ACCEPTED`, never `REJECTED` or `DUPLICATE`;
   - persist successfully after retry but omit the final ACK.

   Add `test_rejected_and_duplicate_are_acked_once` and `test_retry_success_acks_once_after_commit`.

## LOW

10. Legacy NULL provenance is fabricated as empty strings.

   [db.py:237](/private/tmp/claude-501/-Users-subhajlimanond-dev-pwa-bigdata-demo/662ee5b1-ffb2-469f-a64f-7440f903b74b/scratchpad/wt-s3/api/app/db.py:237) maps nullable migration-era identity columns to `""`. That is invented provenance, not NULL handling.

11. `max_queue <= 0` silently creates an unbounded queue.

   [ws.py:52](/private/tmp/claude-501/-Users-subhajlimanond-dev-pwa-bigdata-demo/662ee5b1-ffb2-469f-a64f-7440f903b74b/scratchpad/wt-s3/api/app/ws.py:52) does not validate the constructor. A direct `max_queue=0` probe retained all 10,000 frames. Reject values below one.

12. `test_dlq_route_is_registered_and_shaped` does not test shape.

   [test_dlq.py:76](/private/tmp/claude-501/-Users-subhajlimanond-dev-pwa-bigdata-demo/662ee5b1-ffb2-469f-a64f-7440f903b74b/scratchpad/wt-s3/api/tests/test_dlq.py:76) only asserts route registration and a 503. A completely broken configured-database 200 response remains green.

Focused pytest could not start because this worktree has no API virtualenv and system Python lacks `psycopg_pool`. The direct hub probes did run. I also attempted the mandatory Coding Log append, but the workspace is read-only and the write was rejected.