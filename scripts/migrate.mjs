import { Pool } from 'pg';
import { readFile, readdir } from 'node:fs/promises';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const pool = new Pool({connectionString:process.env.DATABASE_URL}); const db=await pool.connect();
try {
  await db.query('SELECT pg_advisory_lock(578467261)');
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const exists = await db.query("SELECT to_regclass('public.users') AS name");
  if (!exists.rows[0].name) { const sql=await readFile(new URL('../packages/db/schema.sql',import.meta.url),'utf8'); await db.query('BEGIN'); try { await db.query(sql); await db.query("INSERT INTO schema_migrations(name) VALUES('001_initial') ON CONFLICT DO NOTHING"); await db.query('COMMIT'); } catch(e) { await db.query('ROLLBACK'); throw e; } }
  else await db.query("INSERT INTO schema_migrations(name) VALUES('001_initial') ON CONFLICT DO NOTHING");
  const dir=new URL('../packages/db/migrations/',import.meta.url);
  for (const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort()) {
    if ((await db.query('SELECT 1 FROM schema_migrations WHERE name=$1',[name])).rowCount) continue;
    await db.query('BEGIN'); try { await db.query(await readFile(new URL(name,dir),'utf8')); await db.query('INSERT INTO schema_migrations(name) VALUES($1)',[name]); await db.query('COMMIT'); console.log(`Applied ${name}`); } catch(e) { await db.query('ROLLBACK'); throw e; }
  }
} finally { await db.query('SELECT pg_advisory_unlock(578467261)'); db.release(); await pool.end(); }
