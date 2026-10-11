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
  return <div className="space-y-6">
    <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
    <AdminSessions />
    <Card>
      <CardHeader>
        <CardTitle><h2>Login settings</h2></CardTitle>
        <CardDescription>Manage access for playtesting.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-6">
          <div className="space-y-2">
            <Label htmlFor="email-login">Enable email test login</Label>
            <p id="email-login-description" className="text-sm text-muted-foreground">Invited players in the active session can log in without a password.</p>
          </div>
          <Switch id="email-login" aria-describedby="email-login-description" checked={settings.data.emailLoginEnabled} disabled={update.isPending} onCheckedChange={(checked) => update.mutate(checked)} />
        </div>
        {update.isPending && <p role="status" className="text-sm text-muted-foreground">Saving…</p>}
        {update.error && <ErrorMessage message={update.error.message} />}
      </CardContent>
    </Card>
  </div>
}
