import { useState, type SubmitEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { ErrorMessage, LoadingMessage } from '@/components/page-feedback'
import { useAuth, useGoogleLogin, useLoginSettings, useTestEmailLogin } from '../hooks/use-auth'

export function LoginPage() {
  const auth = useAuth()
  const settings = useLoginSettings()
  const google = useGoogleLogin()
  const emailLogin = useTestEmailLogin()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  if (auth.isPending) return <LoadingMessage />
  if (auth.error) return <ErrorMessage message={auth.error.message} />
  if (auth.data) return <Navigate to="/" replace />
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    emailLogin.mutate(email, { onSuccess: () => navigate('/', { replace: true }) })
  }
  return <Card className="mx-auto mt-6 w-full max-w-md sm:mt-12">
    <CardHeader className="gap-2">
      <CardTitle><h1 className="text-2xl font-semibold tracking-tight">Log in</h1></CardTitle>
      <CardDescription>Join Game Theory Night 2.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <Button className="w-full" size="lg" disabled={google.isPending} onClick={() => google.mutate()}>
        {google.isPending ? 'Connecting…' : 'Log in with Google'}
      </Button>
      {google.error && <ErrorMessage message={google.error.message} />}
      {settings.error && <ErrorMessage message={settings.error.message} />}
      {settings.data?.emailLoginEnabled && <>
        <Separator />
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1">
            <h2 className="font-medium">Email test login</h2>
            <p className="text-sm text-muted-foreground">Use any email to log in without a password.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <Button type="submit" variant="outline" size="lg" className="w-full" disabled={emailLogin.isPending}>
            {emailLogin.isPending ? 'Logging in…' : 'Log in'}
          </Button>
          {emailLogin.error && <ErrorMessage message={emailLogin.error.message} />}
        </form>
      </>}
    </CardContent>
  </Card>
}
