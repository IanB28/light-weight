# ADR: Historical Training v1

## Status

Accepted.

## Decision

`WorkoutSession.startedAt` remains the canonical instant at which training
physically occurred. Historical entry adds optional provenance metadata:

- `performedDate` is the athlete's local `YYYY-MM-DD` calendar date;
- `recordedAt` is the instant the record was entered;
- `entrySource` distinguishes `live` from `historical_manual`.

`resolveWorkoutDateKey()` is the only calendar grouping boundary. It uses a
valid `performedDate` and otherwise retains the legacy `startedAt` date-prefix
fallback. Chronological metrics, rolling windows, previous performance, and
PRs continue to order by `startedAt`; `recordedAt` never affects analytics.

Historical sessions are canonical workouts containing explicit physical sets.
They do not create an editable PR record. Existing set eligibility and 1RM
calculation derive PRs, including their achieved time, from those sets.

## Compatibility and persistence

All three new fields are nullable. Existing sessions and backups remain valid
without fabricated metadata. The sync boundary validates new metadata but
accepts legacy payloads, and local normalization removes malformed optional
metadata rather than invalidating an entire legacy session.

## Consequences

An older workout added today appears on its performed date and can update a PR
with its physical `startedAt`. A missing duration remains unknown rather than
being estimated. Server personal-record cache reconciliation and cloud-history
merge policy remain deferred to Block 17.
