import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import dotenv from 'dotenv';

import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

if (!process.env.DATABASE_URL) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('[DB WARNING] DATABASE_URL is not set in environment.');
}

export const sql = postgres(connectionString || '', {
  // Neon pooled URLs plus Vercel's short-lived functions should not create a
  // large pool per instance. Local development keeps its existing headroom.
  max: process.env.VERCEL ? 1 : 10,
  idle_timeout: process.env.VERCEL ? 5 : 20,
  connect_timeout: 10,
  prepare: process.env.VERCEL ? false : undefined,
  ssl: 'require',
});

export let db = drizzle(sql, { schema });

/**
 * Test-only seam for HTTP integration tests that run inside a rolled-back
 * database transaction. Production code always retains the default client.
 */
export function replaceDatabaseForTesting(next: typeof db): () => void {
  const previous = db;
  db = next;
  return () => { db = previous; };
}

export async function testDbConnection(): Promise<{ ok: boolean; message?: string }> {
  try {
    const result = await sql`SELECT 1 as connected`;
    return { ok: result.length > 0 && result[0].connected === 1 };
  } catch (error: unknown) {
    return { ok: false, message: error instanceof Error ? error.message : 'Database unavailable' };
  }
}
