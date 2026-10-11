import { useAdminSettings } from '../hooks/use-admin-settings'

export function AdminPage() {
  const { settings, update } = useAdminSettings()
  if (settings.isPending) return <p>Loading…</p>
  if (settings.error) return <p role="alert">{settings.error.message}</p>
  return <>
    <h1>Admin</h1>
    <label>
      <input type="checkbox" checked={settings.data.emailLoginEnabled} disabled={update.isPending}
        onChange={(event) => update.mutate(event.target.checked)} />
      Enable email test login
    </label>
    <p>Teams can log in with any email without a password when enabled.</p>
    {update.error && <p role="alert">{update.error.message}</p>}
  </>
}
