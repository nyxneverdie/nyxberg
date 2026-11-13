'use client';
import Link from 'next/link';
import {useState} from 'react';
type Item={id:string;message:string;resource_id:string;read_at:string|null};
export default function NotificationList({initial}:{initial:Item[]}){const [items,setItems]=useState(initial);async function read(id:string){const res=await fetch('/api/v1/notifications',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});if(res.ok)setItems(items.map(i=>i.id===id?{...i,read_at:new Date().toISOString()}:i))}return items.length?<div>{items.map(i=><div className="file-row" key={i.id}><Link href={`/contribution/${i.resource_id}`} onClick={()=>read(i.id)}>{i.message}</Link><span>{i.read_at?'Read':'Unread'}</span></div>)}</div>:<p>No notifications yet.</p>}
