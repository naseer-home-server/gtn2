import { useState, type SubmitEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth, useGoogleLogin, useLoginSettings, useTestEmailLogin } from '../hooks/use-auth'

export function LoginPage() {
  const auth = useAuth()
  const settings = useLoginSettings()
  const google = useGoogleLogin()
  const emailLogin = useTestEmailLogin()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  if (auth.isPending) return <p>Loading…</p>
  if (auth.error) return <p role="alert">{auth.error.message}</p>
  if (auth.data) return <Navigate to="/" replace />
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    emailLogin.mutate(email, { onSuccess: () => navigate('/', { replace: true }) })
  }
  return <>
    <h1>Log in</h1>
    <button disabled={google.isPending} onClick={() => google.mutate()}>Log in with Google</button>
    {google.error && <p role="alert">{google.error.message}</p>}
    {settings.error && <p role="alert">{settings.error.message}</p>}
    {settings.data?.emailLoginEnabled && <form onSubmit={submit}>
      <h2>Email test login</h2>
      <label>Email <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <button disabled={emailLogin.isPending}>Log in</button>
      {emailLogin.error && <p role="alert">{emailLogin.error.message}</p>}
    </form>}
  </>
}
