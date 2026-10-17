import { LockKeyhole, Star } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatMoney } from '@/lib/game-display'
import { usePlayerSession } from './player-context'

export function PlayAccount() {
  const { view: { team } } = usePlayerSession()
  if (!team) return null
  return <section className="play-account" aria-label="Your team account">
    <div className="play-account-team"><span className="mini-avatar" aria-hidden="true">{team.name.slice(0, 1)}</span><div><p>{team.name}</p><span><Star aria-hidden="true" />{team.stars} {team.stars === 1 ? 'star' : 'stars'}</span></div></div>
    <Link to="/wallet" className="play-account-balance" aria-label={`Open wallet. Team balance ${formatMoney(team.balance)}`}><span><LockKeyhole aria-hidden="true" />Team balance</span><strong aria-live="polite" aria-atomic="true">{formatMoney(team.balance)}</strong></Link>
  </section>
}
