# LLM Usage Storage Proposal

## Title
Short-Term Raw Event Retention with Long-Term Rollup Upserts for `llm_usage_events`

## Date
2026-02-09

## Summary
This proposal keeps detailed LLM usage events for a short debugging window and introduces a durable rollup table updated by SQL upsert on every event write. Raw events are periodically deleted after retention expires. Usage APIs move to the rollup table for stable performance and lower storage growth.

Recommended operating cadence:
- Upsert frequency: every usage event write
- Raw table cleanup frequency: hourly
- Raw retention: 14 days
- Reconciliation backfill frequency: daily

## Problem Statements

### Problem 1: Unbounded raw row growth
`llm_usage_events` receives many writes during interviews, especially from Barbara analysis loops. This creates rapid row growth for normal product usage.

Impact:
- Rising storage and index size
- Higher vacuum overhead
- Growing operational cost over time

### Problem 2: Usage rollups currently depend on scanning raw events
Current rollups are computed by loading event rows and aggregating in application code.

Impact:
- Query cost grows with history
- Performance can degrade for project and workspace rollups
- API latency becomes data-size sensitive

### Problem 3: Mixed needs for observability and billing analytics
Per-call metadata (`rawUsage`, `requestId`, `latencyMs`, `errorMessage`) is useful for short-term debugging, but most long-term reporting needs only aggregated totals.

Impact:
- Keeping all raw data forever over-serves most use cases
- Deleting raw data too aggressively hurts debugging and incident response

### Problem 4: In-memory aggregation is fragile in production
Aggregation approaches that buffer in process memory are vulnerable to process restarts and are difficult to scale across multiple instances.

Impact:
- Data loss risk on crash or deploy
- Inconsistent totals in horizontally scaled environments

## Current State (Repository)
- Write chokepoint: `recordLlmUsageEvent()` in `server/llm-usage.ts`
- Tracked wrapper: `withTrackedLlmCall()` in `server/llm-usage.ts`
- Raw persistence: `createLlmUsageEvent()` in `server/storage.ts`
- Rollup APIs: `/api/usage/*` routes in `server/routes.ts`
- Current rollup method: `computeUsageRollup()` in `server/storage.ts` scans raw rows and aggregates in memory

This is a good foundation because write interception already exists.

## Goals
- Preserve per-call debugging detail for a short period
- Make usage rollups performant and stable as data grows
- Keep rollup totals near real time
- Avoid in-memory buffering and cross-instance consistency issues
- Keep API contracts stable where possible

## Non-Goals
- Redesigning existing usage endpoint payload shapes
- Changing pricing semantics or cost formulas
- Replacing existing observability stack outside usage accounting

## Proposed Design

### 1. Keep raw event table as short-term audit/debug log
Continue writing each call to `llm_usage_events` with existing fields for immediate debugging and support investigations.

Retention policy:
- Keep only recent rows (default: 14 days)
- Delete expired rows on a frequent schedule (hourly)

### 2. Add long-term rollup table
Create `llm_usage_rollups` to store aggregated usage counters by time bucket and dimensions.

Suggested columns:
- `bucket_start` (`timestamp`) hourly bucket
- Attribution keys: `workspace_id`, `project_id`, `template_id`, `collection_id`, `session_id`
- Dimensions: `provider`, `model`, `use_case`, `status`
- Counters: `call_count`, `prompt_tokens`, `completion_tokens`, `total_tokens`, `input_audio_tokens`, `output_audio_tokens`
- Optional quality/ops counters: `error_count`, `latency_ms_sum`, `latency_ms_min`, `latency_ms_max`
- Bookkeeping: `first_event_at`, `last_event_at`, `updated_at`

### 3. Dual write with per-event SQL upsert
At each call to `recordLlmUsageEvent()`:
1. Insert raw row into `llm_usage_events` (as today)
2. Upsert aggregated row in `llm_usage_rollups`

Why per-event upsert:
- Durable across crashes
- Correct in multi-instance deployments
- No delayed flush complexity
- Keeps rollups current

### 4. Move rollup reads to rollup table
Change `getUsageRollupBySession/Collection/Template/Project/Workspace` to query `llm_usage_rollups` instead of scanning raw events.

Keep `/api/usage/session/:sessionId/events` as raw recent events endpoint for debugging.

### 5. Add reconciliation backfill job
Run a daily idempotent reconciliation job that re-aggregates recent raw events (for example, last 48 hours) into rollups.

Purpose:
- Heals transient upsert failures
- Provides operational safety without full transactional coupling

## Data Model Details

### Bucket granularity
Use 1-hour buckets.

Reasoning:
- Large row reduction vs per-call storage
- Sufficient time resolution for product analytics and billing summaries
- Simpler retention and partitioning strategy if needed later

### Conflict key and null handling
Do not rely on nullable columns in unique conflict keys.

Recommended approach:
- Make attribution columns in rollup table `NOT NULL DEFAULT ''`
- Normalize missing attribution to empty string before write

Unique key:
- `bucket_start`
- `workspace_id`, `project_id`, `template_id`, `collection_id`, `session_id`
- `provider`, `model`, `use_case`, `status`

This guarantees deterministic conflict behavior.

## Upsert Logic (Reference SQL)
```sql
INSERT INTO llm_usage_rollups (
  bucket_start,
  workspace_id,
  project_id,
  template_id,
  collection_id,
  session_id,
  provider,
  model,
  use_case,
  status,
  call_count,
  prompt_tokens,
  completion_tokens,
  total_tokens,
  input_audio_tokens,
  output_audio_tokens,
  error_count,
  latency_ms_sum,
  latency_ms_min,
  latency_ms_max,
  first_event_at,
  last_event_at,
  updated_at
)
VALUES (
  date_trunc('hour', $created_at),
  $workspace_id,
  $project_id,
  $template_id,
  $collection_id,
  $session_id,
  $provider,
  $model,
  $use_case,
  $status,
  1,
  $prompt_tokens,
  $completion_tokens,
  $total_tokens,
  $input_audio_tokens,
  $output_audio_tokens,
  CASE WHEN $status IN ('error','timeout') THEN 1 ELSE 0 END,
  COALESCE($latency_ms, 0),
  $latency_ms,
  $latency_ms,
  $created_at,
  $created_at,
  now()
)
ON CONFLICT (
  bucket_start,
  workspace_id,
  project_id,
  template_id,
  collection_id,
  session_id,
  provider,
  model,
  use_case,
  status
)
DO UPDATE SET
  call_count = llm_usage_rollups.call_count + 1,
  prompt_tokens = llm_usage_rollups.prompt_tokens + EXCLUDED.prompt_tokens,
  completion_tokens = llm_usage_rollups.completion_tokens + EXCLUDED.completion_tokens,
  total_tokens = llm_usage_rollups.total_tokens + EXCLUDED.total_tokens,
  input_audio_tokens = llm_usage_rollups.input_audio_tokens + EXCLUDED.input_audio_tokens,
  output_audio_tokens = llm_usage_rollups.output_audio_tokens + EXCLUDED.output_audio_tokens,
  error_count = llm_usage_rollups.error_count + EXCLUDED.error_count,
  latency_ms_sum = llm_usage_rollups.latency_ms_sum + EXCLUDED.latency_ms_sum,
  latency_ms_min = LEAST(llm_usage_rollups.latency_ms_min, EXCLUDED.latency_ms_min),
  latency_ms_max = GREATEST(llm_usage_rollups.latency_ms_max, EXCLUDED.latency_ms_max),
  first_event_at = LEAST(llm_usage_rollups.first_event_at, EXCLUDED.first_event_at),
  last_event_at = GREATEST(llm_usage_rollups.last_event_at, EXCLUDED.last_event_at),
  updated_at = now();
```

## Frequency Recommendations

### Upsert frequency
Recommended: every event write.

Rationale:
- Always current rollups
- Crash-safe without flush windows
- No in-memory buffering complexity

### Raw clear-down frequency
Recommended: hourly.

Rationale:
- Smooths delete workload
- Avoids large daily delete spikes
- Keeps table size controlled continuously

### Raw retention window
Recommended default: 14 days.

Rationale:
- Enough for debugging, support, and recent incident forensics
- Material reduction in long-term storage

Alternative profiles:
- 7 days: aggressive cost control, weaker troubleshooting horizon
- 30 days: stronger investigation horizon, higher storage cost

### Reconciliation frequency
Recommended: daily, last 48-hour window.

Rationale:
- Detects and heals occasional upsert misses
- Bounded workload
- Simple operations

## Retention Cleanup Job Design

### Job behavior
- Schedule hourly
- Delete old rows in bounded batches (for example, 10,000 rows per batch)
- Repeat until no more expired rows or max per-run batch count reached

### Example deletion predicate
```sql
DELETE FROM llm_usage_events
WHERE created_at < now() - interval '14 days'
LIMIT 10000;
```

If SQL dialect or tooling does not support `DELETE ... LIMIT` directly, use a CTE with primary keys.

### Safety controls
- Log deleted row counts per run
- Track job duration and errors
- Abort on long lock contention

## API and Storage Changes

### Storage layer
- Add `createOrUpdateLlmUsageRollup(...)`
- Update usage rollup getters to read from `llm_usage_rollups`
- Keep `getUsageEventsBySession(...)` for raw recent diagnostics

### Routes
- Keep existing `/api/usage/*` route contracts
- Optionally add metadata in response:
  - `rawRetentionDays`
  - `rollupBucketHours`

## Migration and Rollout Plan
1. Add `llm_usage_rollups` schema and indexes.
2. Deploy schema first.
3. Backfill rollups from existing raw events (start with last 30 to 90 days).
4. Deploy dual-write in `recordLlmUsageEvent()`.
5. Switch usage rollup reads to rollup table.
6. Enable hourly cleanup job with 14-day retention.
7. Enable daily reconciliation.
8. Validate parity for 1 week, then tune retention if needed.

## Backfill Strategy
- Run in time slices (for example, per day) to control transaction size.
- Upsert per bucket key to keep operation idempotent.
- Compare totals before and after cutover on sample sessions/projects.

## Monitoring and Acceptance Criteria

### Must-have metrics
- `rollup_upsert_success_rate`
- `rollup_upsert_latency_ms`
- `raw_cleanup_deleted_rows`
- `raw_cleanup_duration_ms`
- `rollup_reconciliation_rows_adjusted`

### Acceptance criteria
- Rollup totals match raw-derived totals within expected tolerance
- `/api/usage/*` p95 latency remains stable as raw table grows
- Raw table size plateaus according to retention policy
- No material increase in request error rates

## Risks and Mitigations

### Risk: rollup/raw mismatch
Mitigation:
- Daily reconciliation
- Parity checks in monitoring

### Risk: delete job lock contention
Mitigation:
- Batch deletes
- Frequent small runs
- Off-peak scheduling controls if needed

### Risk: null attribution causing key fragmentation
Mitigation:
- Normalize attribution to `''` in rollup table keys
- Enforce non-null columns

### Risk: loss of long-term per-call metadata
Mitigation:
- Preserve recent raw window (14 days)
- Keep rollup counters sufficient for long-term reporting

## Decision
Adopt dual-write with per-event rollup upsert and short-term raw retention.

Operational defaults:
- Upsert: per event
- Cleanup: hourly
- Raw retention: 14 days
- Reconciliation: daily over last 48 hours

This is the best balance of durability, scalability, observability, and implementation simplicity for the current architecture.
