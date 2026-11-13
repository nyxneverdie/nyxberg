import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {currentUser,sameOrigin} from '../../../../lib/auth';
import {query} from '../../../../lib/db';
export async function PATCH(req:NextRequest){if(!await sameOrigin())return NextResponse.json({error:'Invalid origin'},{status:403});const user=await currentUser();if(!user)return NextResponse.json({error:'Sign in required'},{status:401});const d=z.object({bio:z.string().max(500)}).safeParse(await req.json());if(!d.success)return NextResponse.json({error:'Bio must be at most 500 characters'},{status:400});await query('UPDATE users SET bio=$1 WHERE id=$2',[d.data.bio,user.id]);return NextResponse.json({ok:true})}
