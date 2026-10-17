import { useCaveSeconds } from '@/hooks/use-cave-seconds'
import { Clock3 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { usePlayerSession } from './player-context'

export function CaveClock({ deadline }: { deadline: number }) {
  const seconds = useCaveSeconds(deadline)
  return <div className="cave-clock" role="timer" aria-live="off"><span className="flex items-center gap-2"><Clock3 className="size-4" aria-hidden="true" />Next cave check</span><strong>{seconds}s</strong></div>
}
export function CaveBanner() {
  const { view } = usePlayerSession()
  const deadline = view.game === 'cave' && !view.roundState?.hasLeft ? view.roundState?.nextTickAt : null
  const seconds = useCaveSeconds(deadline)
  if (deadline == null) return null
  return <div className="cave-banner"><span role="timer" aria-live="off">Cave check in <strong>{seconds}s</strong></span><Link to="/play">Back to play</Link></div>
}
