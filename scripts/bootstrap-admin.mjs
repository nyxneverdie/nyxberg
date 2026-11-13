import { Pool } from 'pg';
import { randomBytes, scryptSync } from 'node:crypto';
const { DATABASE_URL, NYXBERG_ADMIN_USERNAME, NYXBERG_ADMIN_EMAIL, NYXBERG_ADMIN_PASSWORD } = process.env;
if (!DATABASE_URL || !NYXBERG_ADMIN_USERNAME || !NYXBERG_ADMIN_EMAIL || !NYXBERG_ADMIN_PASSWORD) throw new Error('Set DATABASE_URL, NYXBERG_ADMIN_USERNAME, NYXBERG_ADMIN_EMAIL and NYXBERG_ADMIN_PASSWORD in the environment.');
if (!/^[a-z0-9][a-z0-9-]{2,31}$/.test(NYXBERG_ADMIN_USERNAME) || NYXBERG_ADMIN_PASSWORD.length < 12) throw new Error('Username must be lowercase, 3–32 characters; password must be at least 12 characters.');
const salt=randomBytes(16).toString('hex');const hash=`scrypt:${salt}:${scryptSync(NYXBERG_ADMIN_PASSWORD,salt,64).toString('hex')}`;const db=new Pool({connectionString:DATABASE_URL});try {await db.query("INSERT INTO users(username,email,password_hash,role,email_verified_at) VALUES($1,$2,$3,'ADMIN',now())",[NYXBERG_ADMIN_USERNAME,NYXBERG_ADMIN_EMAIL.toLowerCase(),hash]);console.log('Admin created. Remove bootstrap credentials from your environment.');} finally {await db.end();}
