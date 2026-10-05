import type postgres from 'postgres';

// Database-wide test-fixture gate: (198, 31), in PostgreSQL's two-int key space.
// Acquire BEFORE any table access. DDL replays take exclusive mode; DML-only
// fixtures with disjoint identities take shared mode. Never upgrade a shared
// lease to exclusive, or acquire this gate after taking relation/row locks.
// Any per-fixture identity lock comes AFTER this gate and BEFORE table access.
// Transaction scope releases the lease on commit/rollback and is pooler-safe.
export async function lockPostgresFixture(
  tx: postgres.TransactionSql,
  mode: 'exclusive' | 'shared' = 'exclusive'
): Promise<void> {
  if (mode === 'shared') await tx`SELECT pg_advisory_xact_lock_shared(198, 31)`;
  else await tx`SELECT pg_advisory_xact_lock(198, 31)`;
}

/**
 * Multi-connection HTTP tests need committed fixtures and real concurrent
 * requests. Reserve a transaction ONLY for the shared lease; work uses other
 * connections, not this transaction. Include fixture cleanup in run's finally.
 * The pool must have spare connections, and sql.end() belongs AFTER this helper
 * settles, otherwise it would wait for its own lease transaction to finish.
 */
export async function withSharedPostgresFixture(
  sql: postgres.Sql,
  run: () => Promise<void>
): Promise<void> {
  await sql.begin(async (tx) => {
    await lockPostgresFixture(tx, 'shared');
    await run();
  });
}
