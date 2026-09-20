# Database migrations

`0000_product_domain_semantics_v1.sql` closes loading/set semantics. `0001_auth_friends_routine_sharing_v1.sql` additively introduces account identity, revocable sessions, friendships and copy-based routine sharing. `0002_auth_identities_v1.sql` additively introduces federated identity support (auth_identities) for Google Sign-In. `0004` and `0005` add machine base-resistance support and integrity checks. `0006_historical_workout_provenance.sql` additively stores historical workout provenance (`performed_date`, `recorded_at`, and `entry_source`).

- Existing database: run `pnpm --filter @light-weight/api db:migrate`.
- Empty database: create the baseline with `pnpm --filter @light-weight/api db:push`, then run `db:migrate` so Drizzle records the migration. The SQL is idempotent for the columns and constraints it owns.
- Pre-deploy validation: run `pnpm --filter @light-weight/api db:validate-domain-migration`. It executes the migration against the configured database inside a transaction, verifies backfills and row counts, and always rolls back.
- Auth pre-deploy validation: run `pnpm --filter @light-weight/api db:validate-auth-migration`. It verifies the new columns/tables and preservation of existing users inside a rolled-back transaction.
- Drizzle ledger validation: run `pnpm --filter @light-weight/api db:validate-migrate-pipeline`. It forces a clean migration ledger inside a transaction, verifies that the first run applies `0000` and `0001`, verifies the second is a no-op, then rolls back.

Existing demo users keep working as legacy data but have no password hash and therefore cannot authenticate until explicitly converted. Email values are normalized to lowercase; because this phase precedes real users, any pre-existing case-only duplicate emails should be resolved before applying the migration.

Before production, configure `WEB_ORIGINS` with the exact HTTPS web origin and leave secure session cookies enabled. The API uses credentialed CORS, an HTTP-only opaque session cookie, and a separate CSRF token.

Routine sharing only allows server-verified public catalog exercises. Before enabling sharing in a new environment, seed the catalog once with `pnpm --filter @light-weight/api db:seed-catalog`.

The validation command does not apply schema changes permanently.
