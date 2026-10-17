import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const { auth } = vi.hoisted(() => ({ auth: { data: null as null | { isAdmin: boolean; gameSession: { sessionId: string; playerId: string } } } }))
vi.mock('supertokens-auth-react', () => ({ SuperTokensWrapper: ({ children }: { children: ReactNode }) => children }))
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ ...auth, isPending: false }), useSignOut: () => ({}) }))
vi.mock('@/pages/LoginPage', () => ({ LoginPage: () => <p>Sign in to continue</p> }))
vi.mock('@/components/chats', () => ({ Chats: () => <p>Private host chats</p> }))

beforeEach(() => { vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); auth.data = { isAdmin: true, gameSession: { sessionId: 'session', playerId: 'host' } } })
afterEach(cleanup)

function openRoute(path: string) {
  window.history.replaceState({}, '', path)
  return render(<App />)
}

describe('presentation access and host separation', () => {
  it('shows only the welcome slide and presentation controls on the TV route', async () => {
    openRoute('/admin/presentation/present')
    await screen.findByRole('article', { name: 'Welcome slide' })
    expect(screen.queryByRole('navigation', { name: 'Admin navigation' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open account' })).toBeNull()
    expect(screen.queryByText('Private host chats')).toBeNull()
    expect(screen.getByRole('button', { name: 'Fullscreen' })).toBeTruthy()
  })

  it('keeps host tools in the preview and opens the presentation in a separate tab', async () => {
    openRoute('/admin/presentation')
    const launch = await screen.findByRole('link', { name: 'Open presentation' })
    expect(launch.getAttribute('target')).toBe('_blank')
    expect(launch.getAttribute('rel')).toContain('noopener')
    expect(launch.getAttribute('href')).toBe('/admin/presentation/present')
    expect(screen.getByRole('navigation', { name: 'Admin navigation' })).toBeTruthy()
    expect(screen.getByText('Private host chats')).toBeTruthy()
  })


  it('moves through reveals and respects the deck boundaries with Home and End', async () => {
    openRoute('/admin/presentation/present')
    await screen.findByRole('article', { name: 'Welcome slide' })
    expect((screen.getByRole('button', { name: 'Previous step' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    await screen.findByRole('article', { name: 'Game theory slide' })
    expect(window.location.search).toBe('?slide=game-theory')
    expect(screen.queryByRole('complementary', { name: 'Private presenter notes' })).toBeNull()
    fireEvent.keyDown(document, { key: 'End' })
    await screen.findByRole('article', { name: 'Award eligibility slide' })
    expect(window.location.search).toBe('?slide=eligibility')
    expect((screen.getByRole('button', { name: 'Next step' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(window.location.search).toBe('?slide=eligibility')
    fireEvent.keyDown(document, { key: 'Home' })
    await screen.findByRole('article', { name: 'Welcome slide' })
    expect(window.location.search).toBe('')
  })

  it('reveals each part of the plan on demand and reverses across the slide boundary', async () => {
    openRoute('/admin/presentation/present?slide=plan')
    await screen.findByRole('article', { name: 'Plan for today slide' })
    expect(screen.queryByRole('heading', { name: 'Teams of 2' })).toBeNull()
    fireEvent.keyDown(document, { key: ' ' })
    expect(screen.getByRole('heading', { name: 'Teams of 2' })).toBeTruthy()
    expect(window.location.search).toBe('?slide=plan&step=2')
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    await screen.findByRole('article', { name: 'The temptation slide' })
    expect(screen.getByText('All cooperate')).toBeTruthy()
    expect(screen.queryByText('Betray to lead')).toBeNull()
    expect(screen.queryByText('All betray')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }))
    expect(screen.getByText('Betray to lead')).toBeTruthy()
    expect(screen.queryByText('All betray')).toBeNull()
    fireEvent.keyDown(document, { key: 'PageDown' })
    expect(screen.getByText('All betray')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    expect(screen.queryByText('All betray')).toBeNull()
    fireEvent.keyDown(document, { key: 'PageUp' })
    expect(screen.queryByText('Betray to lead')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Previous step' }))
    await screen.findByRole('article', { name: 'Plan for today slide' })
    expect(screen.getByRole('heading', { name: 'Teams of 2' })).toBeTruthy()
  })

  it('reveals the payoff diagram, takeaway, and real-life examples in sequence', async () => {
    openRoute('/admin/presentation/present?slide=game-theory')
    await screen.findByRole('article', { name: 'Game theory slide' })
    expect(screen.queryByRole('table')).toBeNull()
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(screen.getByRole('table', { name: /Prisoner’s dilemma/ })).toBeTruthy()
    expect(screen.queryByText('Both tempted to betray. Both worse off.')).toBeNull()
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(screen.getByText('Both tempted to betray. Both worse off.')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    await screen.findByRole('article', { name: 'Real-life games slide' })
    expect(screen.getByText('Shared kitchen')).toBeTruthy()
    expect(screen.queryByText('Group project')).toBeNull()
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(screen.getByText('Group project')).toBeTruthy()
    expect(screen.queryByText('Shared fishery')).toBeNull()
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(screen.getByText('Shared fishery')).toBeTruthy()
  })

  it('previews and launches the selected reveal, preserving it when opened directly', async () => {
    openRoute('/admin/presentation?slide=plan&step=2')
    await screen.findByRole('heading', { name: 'Teams of 2' })
    expect(screen.getByRole('link', { name: 'Open presentation' }).getAttribute('href')).toBe('/admin/presentation/present?slide=plan&step=2')
    fireEvent.click(screen.getByRole('button', { name: 'Previous step' }))
    expect(screen.queryByRole('heading', { name: 'Teams of 2' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Open presentation' }).getAttribute('href')).toBe('/admin/presentation/present?slide=plan')
  })

  it.each(['bad', '-1', '1.5'])('handles an invalid reveal value %s', async value => {
    openRoute(`/admin/presentation/present?slide=plan&step=${value}`)
    await screen.findByRole('article', { name: 'Plan for today slide' })
    expect(screen.queryByRole('heading', { name: 'Teams of 2' })).toBeNull()
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(screen.getByRole('heading', { name: 'Teams of 2' })).toBeTruthy()
  })

  it('bounds old reveal links on the single-step eligibility slide', async () => {
    openRoute('/admin/presentation/present?slide=eligibility&step=999')
    await screen.findByRole('heading', { name: 'Most Devious' })
    expect((screen.getByRole('button', { name: 'Next step' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    expect(window.location.search).toBe('?slide=prizes&step=2')
    await screen.findByRole('article', { name: 'Prizes slide' })
  })

  it('shows the AI discussion in one step and advances directly to prizes', async () => {
    openRoute('/admin/presentation/present?slide=ai-simulations&step=2')
    await screen.findByRole('article', { name: 'One more thing slide' })
    expect(screen.getByRole('img', { name: /Seven AI agents discussing/ })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    await screen.findByRole('article', { name: 'Prizes slide' })
    expect(window.location.search).toBe('?slide=prizes')
  })

  it('opens a selected slide with private presenter notes only in the host preview', async () => {
    openRoute('/admin/presentation?slide=game-theory')
    await screen.findByRole('article', { name: 'Game theory slide' })
    expect(screen.getByRole('link', { name: 'Open presentation' }).getAttribute('href')).toBe('/admin/presentation/present?slide=game-theory')
    expect(screen.getByRole('complementary', { name: 'Private presenter notes' })).toBeTruthy()
  })

  it.each([['game-theory', 'Game theory slide'], ['real-life', 'Real-life games slide'], ['plan', 'Plan for today slide'], ['temptation', 'The temptation slide'], ['ai-simulations', 'One more thing slide'], ['prizes', 'Prizes slide'], ['eligibility', 'Award eligibility slide']])('loads the TV view directly on %s', async (id, label) => {
    openRoute(`/admin/presentation/present?slide=${id}`)
    await screen.findByRole('article', { name: label })
    expect(screen.queryByRole('complementary', { name: 'Private presenter notes' })).toBeNull()
  })

  it.each(['/admin/presentation', '/admin/presentation/present'])('denies players access to %s', async path => {
    auth.data!.isAdmin = false
    openRoute(path)
    await screen.findByText('Admin access required.')
    expect(screen.queryByRole('article', { name: 'Welcome slide' })).toBeNull()
  })

  it('requires a login when the TV route is opened without a session', async () => {
    auth.data = null
    openRoute('/admin/presentation/present')
    await screen.findByText('Sign in to continue')
    expect(screen.queryByRole('article', { name: 'Welcome slide' })).toBeNull()
  })
})
