import AccountForm from '../../components/account-form';
export default async function Page({searchParams}:{searchParams:Promise<{token?:string}>}){const {token}=await searchParams;return <div className="wrap content-page"><h1>Reset your password.</h1><div className="panel">{token?<AccountForm mode="reset-password" token={token}/>:<p>Open the reset link from your email.</p>}</div></div>}
