import type { ReactNode } from 'react'
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { SuperTokensWrapper } from 'supertokens-auth-react'
import { SignInAndUpCallback } from 'supertokens-auth-react/recipe/thirdparty/prebuiltui'
import { useAuth, useSignOut } from './hooks/use-auth'
import { AdminPage } from './pages/AdminPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ErrorMessage, LoadingMessage } from '@/components/page-feedback'

function RequireLogin({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const auth = useAuth()
  if (auth.isPending) return <LoadingMessage />
  if (auth.error) return <ErrorMessage message={auth.error.message} />
  if (!auth.data) return <Navigate to="/login" replace />
  if (admin && !auth.data.isAdmin) return <ErrorMessage message="Admin access required." />
  return children
}
function Navigation() {
  const auth = useAuth()
  const signOut = useSignOut()
  const navigate = useNavigate()
  return <header className="border-b bg-background">
    <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-4 px-4 py-4 sm:px-6">
      <Link to="/" className="rounded-sm font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-ring">Game Theory Night 2</Link>
      <nav aria-label="Main navigation" className="flex items-center gap-1">
        <Button asChild variant="ghost"><NavLink to="/" className="aria-[current=page]:bg-muted">Home</NavLink></Button>
        {auth.data?.isAdmin && <Button asChild variant="ghost"><NavLink to="/admin" className="aria-[current=page]:bg-muted">Admin</NavLink></Button>}
      </nav>
      <div className="ml-auto flex min-w-0 flex-wrap items-center gap-3">
        {auth.data ? <>
          <span className="max-w-48 truncate text-sm text-muted-foreground" title={auth.data.email ?? undefined}>{auth.data.email}</span>
          {auth.data.isTestLogin && <Badge variant="secondary">Test login</Badge>}
          <Button variant="outline" disabled={signOut.isPending} onClick={() => signOut.mutate(undefined, { onSuccess: () => navigate('/login') })}>
            {signOut.isPending ? 'Logging out…' : 'Log out'}
          </Button>
        </> : <Button asChild variant="outline"><Link to="/login">Log in</Link></Button>}
      </div>
      {signOut.error && <ErrorMessage message={signOut.error.message} />}
    </div>
  </header>
}
export default function App() {
  return <SuperTokensWrapper><BrowserRouter>
    <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-background focus:p-3">Skip to content</a>
    <Navigation />
    <main id="main-content" className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6"><Routes>
      <Route path="/" element={<RequireLogin><HomePage /></RequireLogin>} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/login/callback/:provider" element={<SignInAndUpCallback />} />
      <Route path="/admin" element={<RequireLogin admin><AdminPage /></RequireLogin>} />
      <Route path="*" element={<p>Page not found.</p>} />
    </Routes></main>
  </BrowserRouter></SuperTokensWrapper>
}
