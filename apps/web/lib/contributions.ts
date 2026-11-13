import type { Actor } from './auth';
import {query} from './db';
export type Contribution={id:string;repo_id:string;author_id:string;number:number;type:string;title:string;body:string;status:string;created_at:string;username:string;slug:string;owner:string};
export async function contribution(id:string,user:Actor|null):Promise<Contribution|null>{if(!/^[a-f0-9-]{36}$/i.test(id))return null;return (await query<Contribution>(`SELECT c.id,c.repo_id,c.author_id,c.number,c.type,c.title,c.body,c.status,c.created_at,u.username,r.slug,o.username AS owner FROM contributions c JOIN users u ON u.id=c.author_id JOIN repositories r ON r.id=c.repo_id JOIN users o ON o.id=r.owner_id WHERE c.id=$1 AND r.deleted_at IS NULL AND (r.visibility='PUBLIC' OR r.owner_id=$2) AND (c.type<>'SECURITY' OR c.author_id=$2 OR r.owner_id=$2)`,[id,user?.id||null]))[0]||null}
export { transitionsFor } from './contribution-states';
