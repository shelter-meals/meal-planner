import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  type User,
} from 'firebase/auth'
import { ArrowUpRight, Mail, ShieldCheck } from 'lucide-react'
import { AuthContext } from './AuthContext'
import { auth, firebaseConfigured, initializeAuthPersistence } from '../services/firebase'

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Sign-in could not be completed.'
}

function AuthScreen() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const completingLink = auth ? isSignInWithEmailLink(auth, window.location.href) : false

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!auth) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (completingLink) {
        const storedEmail = window.localStorage.getItem('meal-planner-signin-email')
        const signInEmail = storedEmail || email.trim()
        if (!signInEmail) {
          setError('Enter the email address that received the sign-in link.')
          return
        }
        await signInWithEmailLink(auth, signInEmail, window.location.href)
        window.localStorage.removeItem('meal-planner-signin-email')
        const share = new URLSearchParams(window.location.search).get('share')
        const nextUrl = share
          ? `${window.location.pathname}?share=${encodeURIComponent(share)}`
          : window.location.pathname
        window.history.replaceState({}, document.title, nextUrl)
      } else {
        const actionCodeSettings = {
          url: `${window.location.origin}${window.location.pathname}${window.location.search}`,
          handleCodeInApp: true,
        }
        await sendSignInLinkToEmail(auth, email.trim(), actionCodeSettings)
        window.localStorage.setItem('meal-planner-signin-email', email.trim())
        setMessage(`Sign-in link sent to ${email.trim()}. Open it on this device to continue.`)
      }
    } catch (submitError) {
      setError(errorText(submitError))
    } finally {
      setBusy(false)
    }
  }

  if (!firebaseConfigured || !auth) {
    return (
      <main className="setup-screen">
        <div className="setup-mark" aria-hidden="true">SM</div>
        <p className="eyebrow">Shelter Meal Planner</p>
        <h1>Firebase setup needed</h1>
        <p className="setup-copy">
          Add your Firebase web app settings to <code>app/.env.local</code> to enable secure email sign-in,
          saved plans, and sharing.
        </p>
        <a href="https://firebase.google.com/docs/web/setup" target="_blank" rel="noreferrer">
          Firebase setup guide <ArrowUpRight size={16} />
        </a>
      </main>
    )
  }

  return (
    <main className="setup-screen">
      <div className="setup-mark" aria-hidden="true">SM</div>
      <p className="eyebrow">Shelter Meal Planner</p>
      <h1>{completingLink ? 'Finish signing in' : 'Sign in to your workspace'}</h1>
      <p className="setup-copy">
        Plans are private to your account unless you choose to share them. Any verified email can sign in.
      </p>
      <form className="signin-form" onSubmit={submit}>
        <label htmlFor="signin-email">Email address</label>
        <input
          autoComplete="email"
          id="signin-email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.org"
          required
          type="email"
          value={email}
        />
        <button className="button-primary" disabled={busy} type="submit">
          <Mail size={17} />
          {busy ? 'Please wait…' : completingLink ? 'Complete sign-in' : 'Email me a sign-in link'}
        </button>
        {message && <p className="form-message" role="status">{message}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>
      <p className="privacy-note"><ShieldCheck size={15} /> Your shelter address is never saved with a plan.</p>
    </main>
  )
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(() => !auth)
  const demoMode = import.meta.env.DEV && !firebaseConfigured

  useEffect(() => {
    const currentAuth = auth
    if (!currentAuth) return
    let active = true
    let unsubscribe = () => {}
    void initializeAuthPersistence().then(() => {
      if (!active) return
      unsubscribe = onAuthStateChanged(currentAuth, (nextUser) => {
        if (!active) return
        setUser(nextUser)
        setReady(true)
      }, (error) => {
        console.error('Firebase sign-in state could not be loaded.', error)
        if (active) setReady(true)
      })
    }).catch((error: unknown) => {
      console.error('Could not initialize sign-in persistence.', error)
      if (active) setReady(true)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  if (demoMode) {
    return <AuthContext.Provider value={{ user: null, demoMode }}>{children}</AuthContext.Provider>
  }
  if (!ready) return <div className="loading-screen" role="status">Preparing secure sign-in…</div>
  if (!user) return <AuthScreen />
  return <AuthContext.Provider value={{ user, demoMode: false }}>{children}</AuthContext.Provider>
}
