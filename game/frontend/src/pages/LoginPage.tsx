import { useState, type SubmitEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { ErrorMessage, LoadingMessage } from '@/components/page-feedback'
import { useAuth, useGoogleLogin, useLocalPasswordLogin, useLoginSettings, useTestEmailLogin, useSignOut } from '../hooks/use-auth'
import { isLocalAuth } from '@/config/supertokens'

export function LoginPage() {
  const auth = useAuth()
  const signOut = useSignOut()
  const settings = useLoginSettings()
  const google = useGoogleLogin()
  const localLogin = useLocalPasswordLogin()
  const emailLogin = useTestEmailLogin()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [testEmail, setTestEmail] = useState('')
  if (auth.isPending) return <LoadingMessage />
  if (auth.error) return <div className="space-y-4"><ErrorMessage message={auth.error.message} /><Button variant="outline" disabled={signOut.isPending} onClick={() => signOut.mutate()}>Log out and use another account</Button></div>
  if (auth.data) return <Navigate to="/" replace />
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    localLogin.mutate({ email, password }, {
      onSuccess: (result) => { if (result.status === 'OK') navigate('/', { replace: true }) },
    })
  }
  function submitTestLogin(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    emailLogin.mutate(testEmail, { onSuccess: () => navigate('/', { replace: true }) })
  }
  return <Card className="w-full">
    <CardHeader className="gap-2">
      <CardTitle><h2>Take your seat</h2></CardTitle>
      <CardDescription>Use the email your host invited.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      {!isLocalAuth && <>
        <Button className="w-full" size="lg" disabled={google.isPending} onClick={() => google.mutate()}>
          {google.isPending ? 'Connecting…' : 'Log in with Google'}
        </Button>
        {google.error && <ErrorMessage message={google.error.message} />}
      </>}
      {settings.error && <ErrorMessage message={settings.error.message} />}
      {isLocalAuth && <details className="password-login" open={!settings.data?.emailLoginEnabled}><summary>Host sign-in</summary><form onSubmit={submit} className="space-y-4">
        <div className="space-y-1"><h2 className="font-medium">Email and password</h2><p className="text-sm text-muted-foreground">Use the local test account or an invited player's account.</p></div>
        <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
        {localLogin.data && localLogin.data.status !== 'OK' && <ErrorMessage message={localLogin.data.status === 'SIGN_IN_NOT_ALLOWED' ? localLogin.data.reason : 'Incorrect email or password.'} />}
        {localLogin.error && <ErrorMessage message={localLogin.error.message} />}
        <Button type="submit" size="lg" className="w-full" disabled={localLogin.isPending}>{localLogin.isPending ? 'Logging in…' : 'Log in'}</Button>
      </form></details>}
      {!isLocalAuth && settings.data?.emailLoginEnabled && <>
        <Separator />
        <form onSubmit={submitTestLogin} className="space-y-4">
          <div className="space-y-1">
            <h2 className="font-medium">Email test login</h2>
            <p className="text-sm text-muted-foreground">Use an invited email to log in without a password.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="test-email">Email</Label>
            <Input id="test-email" name="test-email" type="email" autoComplete="email" placeholder="you@example.com" required value={testEmail} onChange={(event) => setTestEmail(event.target.value)} />
          </div>
          <Button type="submit" variant="outline" size="lg" className="w-full" disabled={emailLogin.isPending}>
            {emailLogin.isPending ? 'Logging in…' : 'Log in'}
          </Button>
          {emailLogin.error && <ErrorMessage message={emailLogin.error.message} />}
        </form>
      </>}
      {isLocalAuth && settings.data?.emailLoginEnabled && <>
        <Separator />
        <form onSubmit={submitTestLogin} className="space-y-4">
          <div className="space-y-1"><h2 className="font-medium">Player sign-in</h2><p className="text-sm text-muted-foreground">Enter your invited email to join the table.</p></div>
          <div className="space-y-2"><Label htmlFor="player-test-email">Player email</Label><Input id="player-test-email" name="player-test-email" type="email" autoComplete="email" placeholder="player@example.com" required value={testEmail} onChange={(event) => setTestEmail(event.target.value)} /></div>
          <Button type="submit" variant="outline" size="lg" className="w-full" disabled={emailLogin.isPending}>{emailLogin.isPending ? 'Logging in…' : 'Log in as player'}</Button>
          {emailLogin.error && <ErrorMessage message={emailLogin.error.message} />}
        </form>
      </>}
    </CardContent>
  </Card>
}
