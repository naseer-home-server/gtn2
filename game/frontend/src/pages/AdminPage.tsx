import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ErrorMessage, LoadingMessage } from '@/components/page-feedback'
import { AdminSessions } from '@/components/admin-sessions'
import { useAdminSettings } from '../hooks/use-admin-settings'

export function AdminPage() {
  const { settings, update } = useAdminSettings()
  if (settings.isPending) return <LoadingMessage />
  if (settings.error) return <ErrorMessage message={settings.error.message} />
  return <div className="admin-home space-y-8">
    <header className="page-intro admin-home-intro"><p className="text-sm text-muted-foreground">Host desk</p><h1 className="display-title text-4xl sm:text-5xl">Game night</h1><p className="mt-2 max-w-2xl text-muted-foreground">Set up a table, manage arrivals, and keep the rounds moving.</p></header>
    <AdminSessions />
    <Card className="paper-panel">
      <CardHeader><CardTitle><h2 className="section-heading">Login settings</h2></CardTitle><CardDescription>Manage access for playtesting.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-5"><div className="space-y-2"><Label htmlFor="email-login">Enable email test login</Label><p id="email-login-description" className="max-w-xl text-sm text-muted-foreground">Invited players in the active session can log in without a password.</p></div><Switch id="email-login" aria-describedby="email-login-description" checked={settings.data.emailLoginEnabled} disabled={update.isPending} onCheckedChange={(checked) => update.mutate(checked)} /></div>
        {update.isPending && <p role="status" className="text-sm text-muted-foreground">Saving…</p>}{update.error && <ErrorMessage message={update.error.message} />}
      </CardContent>
    </Card>
  </div>
}
