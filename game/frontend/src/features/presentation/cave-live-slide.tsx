import type { PresentationState } from 'backend/presentation'
import { useCaveSeconds } from '@/hooks/use-cave-seconds'
import { formatMoney } from '@/lib/game-display'
import { Frame } from './game-slide-frame'
import './cave-live-slide.css'

export function CaveLiveSlide({ round, cave, paused, connectionLost = false }: { round: number; cave: NonNullable<PresentationState['cave']>; paused: boolean; connectionLost?: boolean }) {
  const seconds = useCaveSeconds(paused || connectionLost ? null : cave.nextTickAt)
  const finalTick = cave.tick >= cave.maxTicks
  const waiting = !paused && !connectionLost && (cave.nextTickAt === null || seconds === 0)
  const amount = `$${formatMoney(cave.unbanked)}`
  return <Frame game="cave" label={`round ${round} live`} className="cave-live-slide">
    <p className="cave-live-meta">Round {round} · Tick {cave.tick} / {cave.maxTicks}</p>
    <div className="cave-live-readings">
      <section className="cave-live-clock" role="timer" aria-live="off" aria-label="Time remaining in cave tick">
        <strong className={paused ? 'is-paused' : ''}>{connectionLost ? '—' : paused ? 'Paused' : <>{seconds}<span>s</span></>}</strong>
        <p>{connectionLost ? 'Reconnecting…' : paused ? 'Public rank reveal' : waiting ? finalTick ? 'Banking…' : 'Checking cave…' : finalTick ? 'Automatic banking in' : 'Next cave check'}</p>
      </section>
      <section className="cave-live-money" aria-label="Shared unbanked money">
        <strong style={{fontSize:`${Math.max(2.2, Math.min(8.5, 65 / amount.length))}cqw`}}>{connectionLost ? '—' : amount}</strong>
        <p>Unbanked per team still inside</p>
      </section>
    </div>
    <p className="cave-live-prompt">{connectionLost ? 'Waiting for live game data.' : paused ? 'Play resumes after everyone acknowledges.' : finalTick ? 'Leave to bank now. Everyone still inside banks when this tick ends.' : 'Leave to bank this amount. Stay to risk it for more.'}</p>
  </Frame>
}
