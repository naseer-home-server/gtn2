import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '../hooks/use-auth'
import { PlayerGame } from '@/components/player-game'
import { Button } from '@/components/ui/button'
import { Link } from 'react-router-dom'

export function HomePage() {
  const auth = useAuth()
  if (auth.data?.isAdmin) return <div className="space-y-6">
    <div><h1 className="text-2xl font-semibold tracking-tight">Home</h1><p className="mt-1 text-sm text-muted-foreground">Admin account</p></div>
    <Card><CardHeader><CardTitle><h2>Game administration</h2></CardTitle></CardHeader><CardContent className="space-y-3"><p>Manage sessions, arrival order, team assignments, and gameplay.</p><Button asChild><Link to="/admin">Open admin</Link></Button></CardContent></Card>
  </div>
  return <PlayerGame />
}
