import Link from 'next/link';
import Form from '../../components/forms';
export default function Login(){return <div className="wrap content-page"><div className="kicker">WELCOME BACK <span>✳</span></div><h1>Sign in to NyxBerg.</h1><p>Welcome back to your little corner of the internet.</p><div className="panel"><Form mode="login"/></div><p><Link className="accent" href="/forgot-password">Forgot password?</Link></p><p>New here? <Link className="accent" href="/register">About registration →</Link></p></div>}
