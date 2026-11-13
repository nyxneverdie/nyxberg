import { cookies, headers } from 'next/headers';
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { query } from './db';
const scrypt = promisify(scryptCallback);
export async function hashPassword(password: string) { const salt = randomBytes(16).toString('hex'); const hash = await scrypt(password, salt, 64) as Buffer; return `scrypt:${salt}:${hash.toString('hex')}`; }
export async function verifyPassword(password: string, stored: string) { const [algorithm, salt, expected] = stored.split(':'); if (algorithm !== 'scrypt' || !salt || !expected || !/^[a-f0-9]{128}$/.test(expected)) return false; const actual = await scrypt(password, salt, 64) as Buffer; return timingSafeEqual(actual, Buffer.from(expected, 'hex')); }
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export async function currentUser() { const token = (await cookies()).get('nyxberg_session')?.value; if (!token || !process.env.DATABASE_URL) return null; const rows = await query<{id:string;username:string;role:string}>('SELECT u.id,u.username,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.email_verified_at IS NOT NULL', [digest(token)]); return rows[0] || null; }
export async function sameOrigin() { const h = await headers(); const origin = h.get('origin'); if (!origin) return false; try { return new URL(origin).origin === new URL(process.env.APP_URL || 'http://localhost:3000').origin; } catch { return false; } }
export function newToken() { return randomBytes(32).toString('base64url'); }
export type Actor = {id:string;username:string;role:string};
export async function actor(scope?:string):Promise<Actor|null> {
 const h=await headers(); const authorization=h.get('authorization');
 if (authorization?.startsWith('Bearer ')) {
   const token=authorization.slice(7); if(!/^nyxb_[A-Za-z0-9_-]{40,}$/.test(token)) return null;
   const rows=await query<Actor & {scopes:string[]}>(`SELECT u.id,u.username,u.role,t.scopes FROM access_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=$1 AND t.revoked_at IS NULL AND t.expires_at>now() AND u.email_verified_at IS NOT NULL`,[digest(token)]);
   const user=rows[0]; if(!user || (scope && !user.scopes.includes(scope)))return null;return {id:user.id,username:user.username,role:user.role};
 }
 return currentUser();
}
export async function writeAllowed(scope:string) { const h=await headers(); return h.get('authorization')?.startsWith('Bearer ') ? Boolean(await actor(scope)) : await sameOrigin(); }
