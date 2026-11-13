import { query } from './db';
import type { Actor } from './auth';
export async function accessibleRepo(id:string,user:Actor|null) {
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return null;
 return (await query<{id:string;owner_id:string;visibility:string}>("SELECT id,owner_id,visibility FROM repositories WHERE id=$1 AND deleted_at IS NULL AND (visibility='PUBLIC' OR owner_id=$2)",[id,user?.id||null]))[0]||null;
}
