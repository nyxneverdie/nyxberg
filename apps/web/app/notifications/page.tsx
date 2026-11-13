import Link from 'next/link';
import {currentUser} from '../../lib/auth';
import {query} from '../../lib/db';
import NotificationList from '../../components/notification-list';
export const dynamic='force-dynamic';
export default async function Page(){const user=await currentUser();if(!user)return <div className="wrap content-page"><h1>Sign in required.</h1><Link href="/login">Sign in →</Link></div>;const rows=await query<{id:string;message:string;resource_id:string;read_at:string|null}>('SELECT id,message,resource_id,read_at FROM notifications WHERE recipient_id=$1 ORDER BY created_at DESC LIMIT 100',[user.id]);return <div className="wrap content-page"><div className="kicker">YOUR INBOX</div><h1>Notifications</h1><div className="panel"><NotificationList initial={rows}/></div></div>}
