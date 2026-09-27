import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Check, Leaf, ShieldCheck } from 'lucide-react'
import { isSupabaseConfigured, supabase } from './lib/supabase.ts'
import './auth.css'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  const sendMagicLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage('')
    setError('')
    if (!isSupabaseConfigured || !supabase) {
      setError('Add your Supabase URL and anon key to .env to enable secure sign-in.')
      return
    }
    setBusy(true)
    try {
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/today`, shouldCreateUser: true },
      })
      if (authError) setError(authError.message)
      else setMessage(`Your sign-in link is on its way to ${email.trim()}.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send the sign-in link. Please try again.')
    } finally { setBusy(false) }
  }

  const googleSignIn = async () => {
    setMessage('')
    setError('')
    if (!isSupabaseConfigured || !supabase) {
      setError('Add the Supabase URL and anon key to .env to enable secure sign-in.')
      return
    }
    setBusy(true)
    try {
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/today` },
      })
      if (authError) setError(authError.message)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start Google sign-in. Please try again.')
    } finally { setBusy(false) }
  }

  return <main className="login-page">
    <div className="login-decoration login-decoration-one" />
    <div className="login-decoration login-decoration-two" />
    <section className="login-card">
      <Link className="login-brand" to="/today"><span className="brand-mark"><Leaf size={20} fill="currentColor" /></span><span>nudge</span><span className="brand-dot">.</span></Link>
      <div className="login-flower">✿</div>
      <span className="eyebrow">A SOFTER WAY TO BEGIN</span>
      <h1>Welcome to your<br />little corner.</h1>
      <p className="login-intro">Sign in or create an account. We’ll send a quiet little link to your inbox—no password to remember.</p>
      <button className="google-button login-google" onClick={() => void googleSignIn()} disabled={busy}><span className="google-g">G</span> Continue with Google</button>
      <div className="or-divider"><span>or continue with email</span></div>
      <form onSubmit={sendMagicLink} className="login-form">
        <label htmlFor="login-email">Email address</label>
        <input id="login-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
        <button className="primary-button login-submit" type="submit" disabled={busy || !email.trim()}>{busy ? 'Sending your link…' : 'Email me a sign-in link'} <ArrowRight size={15} /></button>
      </form>
      {message && <p className="login-success" role="status"><Check size={16} />{message}</p>}
      {error && <p className="login-error" role="alert">{error}</p>}
      <p className="login-privacy"><ShieldCheck size={14} /> Your account and routines stay yours.</p>
      {!isSupabaseConfigured && <p className="login-config-hint">Sign-in needs the Supabase values from .env.example. Local use is still available below.</p>}
      <button className="local-continue" onClick={() => navigate('/today')}>Continue without signing in <ArrowRight size={14} /></button>
    </section>
    <p className="login-footer">Small steps count. So does taking a breath.</p>
  </main>
}
