import { Pool, type QueryResultRow } from 'pg';

const globalForDb = globalThis as unknown as { nyxbergPool?: Pool };
export function databaseConfigured() { return Boolean(process.env.DATABASE_URL); }
export function pool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  if (!globalForDb.nyxbergPool) globalForDb.nyxbergPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  return globalForDb.nyxbergPool;
}
export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) { return (await pool().query<T>(text, params)).rows; }
