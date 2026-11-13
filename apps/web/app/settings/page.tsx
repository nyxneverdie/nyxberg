import Link from 'next/link';
import {currentUser} from '../../lib/auth';
import {query} from '../../lib/db';
import TokenManager from '../../components/token-manager';
import ProfileForm from '../../components/profile-form';
import LogoutButton from '../../components/logout-button';
export const dynamic='force-dynamic';
export default async function Settings(){const user=await currentUser();if(!user)return <div className="wrap content-page"><h1>Sign in required.</h1><Link href="/login" className="button primary">Sign in</Link></div>;const [profile]=await query<{bio:string}>('SELECT bio FROM users WHERE id=$1',[user.id]);const tokens=await query<{id:string;name:string;expires_at:string;revoked_at:string|null}>('SELECT id,name,expires_at,revoked_at FROM access_tokens WHERE user_id=$1 ORDER BY created_at DESC',[user.id]);return <div className="wrap content-page"><div className="kicker">ACCOUNT / CLI</div><h1>Access tokens</h1><p>Use an expiring token with the CLI. Treat it like a password.</p>{user.role==='ADMIN'&&<p><Link className="text-link" href="/admin">Open admin dashboard →</Link></p>}<div className="panel"><h2>Your profile</h2><p><Link href={`/u/${encodeURIComponent(user.username)}`}>View DevCard →</Link></p><ProfileForm bio={profile?.bio||''}/></div><div className="panel"><h2>CLI tokens</h2><TokenManager initial={tokens}/></div><div className="panel"><LogoutButton/></div></div>}
