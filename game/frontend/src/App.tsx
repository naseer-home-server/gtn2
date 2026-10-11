import type { ReactNode } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { SuperTokensWrapper } from 'supertokens-auth-react'
import { SignInAndUpCallback } from 'supertokens-auth-react/recipe/thirdparty/prebuiltui'
import { useAuth, useSignOut } from './hooks/use-auth'
import { AdminPage } from './pages/AdminPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import './App.css'

function RequireLogin({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const auth = useAuth()
  if (auth.isPending) return <p>Loading…</p>
  if (auth.error) return <p role="alert">{auth.error.message}</p>
  if (!auth.data) return <Navigate to="/login" replace />
  if (admin && !auth.data.isAdmin) return <p role="alert">Admin access required.</p>
  return children
}
function Navigation() {
  const auth = useAuth()
  const signOut = useSignOut()
  const navigate = useNavigate()
  return <nav>
    <Link to="/">Home</Link>{' '}
    {auth.data?.isAdmin && <Link to="/admin">Admin</Link>}{' '}
    {auth.data ? <>
      <span>{auth.data.email}{auth.data.isTestLogin ? ' (test login)' : ''}</span>{' '}
      <button disabled={signOut.isPending} onClick={() => signOut.mutate(undefined, { onSuccess: () => navigate('/login') })}>Log out</button>
    </> : <Link to="/login">Log in</Link>}
    {signOut.error && <p role="alert">{signOut.error.message}</p>}
  </nav>
}
export default function App() {
  return <SuperTokensWrapper><BrowserRouter>
    <Navigation />
    <main><Routes>
      <Route path="/" element={<RequireLogin><HomePage /></RequireLogin>} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/login/callback/:provider" element={<SignInAndUpCallback />} />
      <Route path="/admin" element={<RequireLogin admin><AdminPage /></RequireLogin>} />
      <Route path="*" element={<p>Page not found.</p>} />
    </Routes></main>
  </BrowserRouter></SuperTokensWrapper>
}
