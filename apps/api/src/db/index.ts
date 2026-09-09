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
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: 'require',
});

export const db = drizzle(sql, { schema });

export async function testDbConnection(): Promise<{ ok: boolean; message?: string }> {
  try {
    const result = await sql`SELECT 1 as connected`;
    return { ok: result.length > 0 && result[0].connected === 1 };
  } catch (error: any) {
    return { ok: false, message: error.message };
  }
}
