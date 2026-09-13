# Database migrations

`0000_product_domain_semantics_v1.sql` is the first tracked incremental migration for the existing LightWeight database.

- Existing database: run `pnpm --filter @light-weight/api db:migrate`.
- Empty database: create the baseline with `pnpm --filter @light-weight/api db:push`, then run `db:migrate` so Drizzle records the migration. The SQL is idempotent for the columns and constraints it owns.
- Pre-deploy validation: run `pnpm --filter @light-weight/api db:validate-domain-migration`. It executes the migration against the configured database inside a transaction, verifies backfills and row counts, and always rolls back.

The validation command does not apply schema changes permanently.
