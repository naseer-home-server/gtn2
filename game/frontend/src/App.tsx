import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { BrowserRouter, Link, NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { SuperTokensWrapper } from 'supertokens-auth-react'
import { Dialog } from 'radix-ui'
import { Dices, Wallet, MessageCircle, UsersRound, UserRound, X, LogOut, ArrowLeft, ShieldCheck } from 'lucide-react'
import { useAuth, useSignOut } from '@/hooks/use-auth'
import { LoginPage } from '@/pages/LoginPage'
import { PlayerGame } from '@/components/player-game'
import { ErrorMessage, LoadingMessage } from '@/components/page-feedback'
import { Button } from '@/components/ui/button'
import { Chats } from '@/components/chats'
import { PlayerSessionProvider } from '@/features/player/player-session'
import { usePlayerSession } from '@/features/player/player-context'
import { WalletPage } from '@/features/player/wallet-page'
import { TeamsPage } from '@/features/player/teams-page'
import { CaveBanner } from '@/features/player/round-status'
import { RevealInterruption } from '@/features/player/reveal-interruption'

const AdminPage = lazy(() => import('@/pages/AdminPage').then(module => ({ default: module.AdminPage })))
const AdminPresentationPage = lazy(() => import('@/pages/AdminPresentationPage').then(module => ({ default: module.AdminPresentationPage })))
const PresentationPage = lazy(() => import('@/pages/PresentationPage').then(module => ({ default: module.PresentationPage })))
const SessionPage = lazy(() => import('@/pages/SessionPage').then(module => ({ default: module.SessionPage })))
const SignInAndUpCallback = lazy(() => import('supertokens-auth-react/recipe/thirdparty/prebuiltui').then(module => ({ default: module.SignInAndUpCallback })))

function RequireLogin({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const auth = useAuth()
  if (auth.isPending) return <LoadingMessage />
  const accessRejected = ['UNAUTHORIZED', 'FORBIDDEN'].includes((auth.error as { data?: { code?: string } } | null)?.data?.code ?? '')
  if (auth.error && (!auth.data || accessRejected)) return <main id="main-content" className="player-main"><ErrorMessage message={auth.error.message} /><Button className="mt-4 w-full" onClick={() => void auth.refetch()}>Try again</Button><Button className="mt-3 w-full" variant="outline" asChild><Link to="/login">Use another account</Link></Button></main>
  if (!auth.data) return <Navigate to="/login" replace />
  if (admin && !auth.data.isAdmin) return <main id="main-content" className="player-main"><ErrorMessage message="Admin access required." /><Button variant="outline" asChild className="mt-4"><Link to="/play">Back to play</Link></Button></main>
  return children
}
function Brand({ to = '/' }: { to?: string }) {
  return <Link to={to} className="brand-link" aria-label="Game Theory Night 2 home"><img src="/brand/die.svg" alt="" /><span><strong>Game Theory</strong><small>Night 2</small></span></Link>
}
function AccountMenu() {
  const auth = useAuth(), signOut = useSignOut(), navigate = useNavigate()
  return <Dialog.Root><Dialog.Trigger asChild><Button variant="ghost" size="icon" aria-label="Open account"><UserRound className="size-5" /></Button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="account-content"><div className="mb-6 flex items-center justify-between gap-4"><Dialog.Title className="section-heading">Your seat at the table</Dialog.Title><Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Close account"><X /></Button></Dialog.Close></div><Dialog.Description className="text-sm text-muted-foreground">Signed in as</Dialog.Description><p className="mt-2 break-all font-medium">{auth.data?.email}</p>{auth.data?.isAdmin && <p className="mt-3 flex items-center gap-2 text-sm"><ShieldCheck className="size-4" />Host account</p>}{auth.data?.isTestLogin && <p className="mt-3 text-sm text-muted-foreground">Test login</p>}{signOut.error && <div className="mt-5"><ErrorMessage message={signOut.error.message} /></div>}<Button className="mt-8 w-full" variant="outline" disabled={signOut.isPending} onClick={() => signOut.mutate(undefined, { onSuccess: () => navigate('/login', { replace: true }) })}><LogOut className="size-4" />{signOut.isPending ? 'Logging out…' : 'Log out'}</Button></Dialog.Content></Dialog.Portal></Dialog.Root>
}
function Landing() {
  const auth = useAuth()
  return <Navigate to={auth.data?.isAdmin ? '/admin' : '/play'} replace />
}
function PlayerIdentity() {
  const auth = useAuth()
  if (auth.data?.isAdmin) return <Navigate to="/admin" replace />
  const identity = auth.data?.gameSession
  if (!identity) return <main id="main-content" className="player-main"><ErrorMessage message="Your host needs to invite you to the active game session." /></main>
  return <PlayerSessionProvider key={`${identity.sessionId}:${identity.playerId}`} sessionId={identity.sessionId} playerId={identity.playerId}><PlayerLayout sessionId={identity.sessionId} playerId={identity.playerId} /></PlayerSessionProvider>
}
function PlayerLayout({ sessionId, playerId }: { sessionId: string; playerId: string }) {
  const { pathname } = useLocation()
  const { action, retry, blockedByUncertainTransfer, state } = usePlayerSession()
  const [hasUnreadChats, setHasUnreadChats] = useState(false)
  const chat = pathname.startsWith('/chats'), thread = pathname.startsWith('/chats/')
  useEffect(() => {
    const viewport = window.visualViewport
    const update = () => document.documentElement.style.setProperty('--app-height', `${viewport?.height ?? window.innerHeight}px`)
    update()
    viewport?.addEventListener('resize', update)
    return () => { viewport?.removeEventListener('resize', update); document.documentElement.style.removeProperty('--app-height') }
  }, [])
  return <div className="player-shell">
    <header className="app-header"><div className="header-inner player-header-inner"><Brand to="/play" /><AccountMenu /></div></header>
    {pathname !== '/play' && <CaveBanner />}
    <main id="main-content" className={`player-main${chat ? ' chat-mode' : ''}${thread ? ' thread-mode' : ''}`}>
      <RevealInterruption />
      {state.error && <div className="mb-4 shrink-0"><ErrorMessage message={`Connection interrupted: ${state.error.message}`} /><Button variant="outline" className="mt-2" onClick={() => void state.refetch()}>Refresh game state</Button></div>}
      {blockedByUncertainTransfer && <div className="mb-5 shrink-0 rounded-lg border border-destructive p-4 text-sm" role="alert"><p>Confirm your last transfer before making another game action.</p><Button variant="outline" className="mt-3 w-full" disabled={action.isPending} onClick={() => retry()}>Retry the same transfer</Button></div>}
      {action.error && action.variables?.action.type !== 'money.transfer' && <div className="mb-5 shrink-0 space-y-3"><ErrorMessage message={action.error.message} /><Button variant="outline" disabled={action.isPending} onClick={() => retry()}>Retry the same action</Button></div>}
      <Outlet />
      <Chats sessionId={sessionId} playerId={playerId} mode="page" active={chat} onUnreadChange={setHasUnreadChats} />
    </main>
    {!thread && <nav className="bottom-nav" aria-label="Main navigation"><div>{[
      { to: '/play', label: 'Play', Icon: Dices }, { to: '/wallet', label: 'Wallet', Icon: Wallet },
      { to: '/chats', label: 'Chats', Icon: MessageCircle }, { to: '/teams', label: 'Teams', Icon: UsersRound },
    ].map(({ to, label, Icon }) => <NavLink to={to} key={to} aria-label={to === '/chats' && hasUnreadChats ? 'Chats, unread messages' : undefined}><span className="nav-icon"><Icon aria-hidden="true" />{to === '/chats' && hasUnreadChats && <span className="unread-dot nav-unread-dot" aria-hidden="true" />}</span><span>{label}</span></NavLink>)}</div></nav>}
  </div>
}
function AdminLayout() {
  const auth = useAuth(), identity = auth.data?.gameSession
  return <><header className="app-header"><div className="header-inner"><Brand to="/admin" /><div className="flex items-center gap-3"><span className="text-sm text-muted-foreground">Host desk</span><AccountMenu /></div></div></header><main id="main-content" className="admin-main"><nav className="section-tabs admin-destinations" aria-label="Admin navigation"><NavLink to="/admin" end>Sessions</NavLink><NavLink to="/admin/presentation">Presentation</NavLink></nav><Suspense fallback={<LoadingMessage />}><Outlet /></Suspense></main>{identity && <Chats key={`${identity.sessionId}:${identity.playerId}`} sessionId={identity.sessionId} playerId={identity.playerId} />}</>
}
function LoginLayout() {
  return <main id="main-content" className="login-page"><div className="invitation-frame"><div className="login-brand"><img src="/brand/die.svg" alt="" /><h1>Game Theory<br />Night 2</h1><p>Do you trust your friends?</p></div><LoginPage /><p className="login-footer">Five games. Three rounds each. Decide together.</p></div></main>
}
function RouteScroll() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}
export default function App() {
  return <SuperTokensWrapper><BrowserRouter><a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-100 focus:rounded focus:bg-card focus:p-3">Skip to content</a><RouteScroll /><Routes>
    <Route path="/" element={<RequireLogin><Landing /></RequireLogin>} />
    <Route element={<RequireLogin><PlayerIdentity /></RequireLogin>}>
      <Route path="/play" element={<PlayerGame />} /><Route path="/wallet" element={<WalletPage />} /><Route path="/teams" element={<TeamsPage />} /><Route path="/chats" element={null} /><Route path="/chats/:conversationId" element={null} />
    </Route>
    <Route element={<RequireLogin admin><AdminLayout /></RequireLogin>}><Route path="/admin" element={<AdminPage />} /><Route path="/admin/presentation" element={<AdminPresentationPage />} /><Route path="/admin/sessions/:sessionId" element={<SessionPage />} /></Route>
    <Route path="/admin/presentation/present" element={<RequireLogin admin><Suspense fallback={<LoadingMessage />}><PresentationPage /></Suspense></RequireLogin>} />
    <Route path="/login" element={<LoginLayout />} /><Route path="/login/callback/:provider" element={<main id="main-content"><Suspense fallback={<LoadingMessage />}><SignInAndUpCallback /></Suspense></main>} />
    <Route path="*" element={<main id="main-content" className="player-main"><h1 className="display-title">That seat is empty.</h1><p className="my-4 text-muted-foreground">We couldn’t find this page.</p><Button asChild><Link to="/"><ArrowLeft />Back to the table</Link></Button></main>} />
  </Routes></BrowserRouter></SuperTokensWrapper>
}
