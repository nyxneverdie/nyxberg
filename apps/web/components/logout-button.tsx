'use client';
import {useRouter} from 'next/navigation';
import {useState} from 'react';
export default function LogoutButton(){const router=useRouter();const [message,setMessage]=useState('');async function logout(){try{const res=await fetch('/api/v1/auth/logout',{method:'POST'});if(!res.ok){setMessage('Unable to sign out.');return}router.push('/');router.refresh()}catch{setMessage('Unable to sign out.')}}return <><button className="button secondary" onClick={logout}>Sign out</button>{message&&<p role="status">{message}</p>}</>}
