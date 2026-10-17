import type { GameId } from 'backend/game'
import qrcode from 'qrcode-generator'
import { ArrowRight, Flag, Star, UsersRound } from 'lucide-react'
import { gameNames } from '@/lib/game-display'
import { GameMark } from '@/features/player/game-mark'
import { usePresentationStage } from './use-presentation-stage'
import { useDiscussionClock } from './use-discussion-clock'
import { displayClock, remainingPlayers } from './stage-model'
import { GameInstructionSlide, GameInputDemoSlide, GameModifiersSlide, BonusRulesSlide, HighLowExampleSlide, CircleReceivedSlide } from './game-instruction-slides'
import { BombBalanceSlide, BombBucketsSlide } from './bomb-instruction-slides'
import { CaveLiveSlide } from './cave-live-slide'
import { CaveDecisionSlide, CaveCollapseSlide } from './cave-instruction-slides'
import './live-slides.css'

export function StageUnavailable() {
  const { state } = usePresentationStage()
  return <article className="welcome-slide stage-unavailable"><UsersRound /><h1>{state.isPending ? 'Connecting to the game…' : state.error ? 'Game connection interrupted' : 'Choose tonight’s session'}</h1><p>{state.isPending ? 'Getting the table ready.' : state.error ? 'Reconnect from the host desk.' : 'Activate the session in the admin view.'}</p></article>
}
export function TeamFormationSlide() {
  const { state, draft } = usePresentationStage()
  const data = state.data
  if (!data) return <StageUnavailable />
  const remaining = remainingPlayers(data.players, draft)
  const prepared = data.teams.length > 0
  const available = prepared ? [] : remaining.slice(1)
  const formed = prepared ? data.teams : draft.map((team, i) => ({ id: String(i), name: team.playerIds.map(id => data.players.find(p => p.id === id)?.name).join(' & '), playerIds: team.playerIds }))
  return <article className="welcome-slide" aria-label="Make teams slide"><header className="theory-heading"><h1>Find your partner</h1></header>
    <div className={`formation-scene${prepared ? ' is-prepared' : ''}`}>
      <header className="formation-current">
        <div><p>{prepared ? 'Ready to play' : remaining.length ? 'Choosing now' : 'Ready to confirm'}</p><h2>{prepared ? 'Teams are set' : remaining.length ? remaining[0].name : 'Everyone has a team'}</h2></div>
        <p className="formation-prompt">{prepared ? 'Our fixed tie order' : remaining.length === 1 ? 'One player left — our solo team.' : remaining.length ? 'Pick any available teammate.' : 'Confirm the teams on the host desk.'}</p>
      </header>
      {!prepared && <section className="formation-available" aria-labelledby="formation-available-heading">
        <h3 id="formation-available-heading">Available teammates <span>{available.length}</span></h3>
        {available.length ? <ol className="formation-members" aria-label="Available teammates in arrival order">{available.map(player => <li key={player.id}><span aria-label={`Arrival ${player.arrivalOrder}`}>{player.arrivalOrder}</span><strong>{player.name}</strong></li>)}</ol> : <p className="formation-empty">{remaining.length === 1 && !prepared ? 'No partner left to choose.' : 'Everyone is paired.'}</p>}
      </section>}
      <section className="formation-completed" aria-labelledby="formation-teams-heading">
        <h3 id="formation-teams-heading">Teams formed <span>{formed.length}</span></h3>
        <ol className="formation-teams" aria-label="Teams in tie order">{formed.map((team, i) => <li key={team.id}><span>{i + 1}</span><div className="formation-team-details"><strong>{team.name}</strong><div className="formation-team-members">{team.playerIds.map(id => {
          const player = data.players.find(member => member.id === id)
          return <div key={id}>{prepared && <span>{player?.name}</span>}{player?.email && <small>{player.email}</small>}</div>
        })}</div></div></li>)}</ol>
        {!formed.length && <p className="formation-empty">Your teams will appear here.</p>}
      </section>
    </div>
  </article>
}

const joinQr = qrcode(0, 'M')
joinQr.addData('https://gtn.24071999.xyz')
joinQr.make()
const qrCount = joinQr.getModuleCount()
const qrPath = Array.from({ length: qrCount }, (_, y) => Array.from({ length: qrCount }, (_, x) => joinQr.isDark(y, x) ? `M${x + 4} ${y + 4}h1v1h-1z` : '').join('')).join('')
export function JoinGameSlide() {
  return <article className="welcome-slide" aria-label="Join the game slide"><div className="join-scene"><div><h1>Take your seat</h1><a href="https://gtn.24071999.xyz" target="_blank" rel="noopener noreferrer">gtn.24071999.xyz</a></div><svg className="join-qr" viewBox={`0 0 ${qrCount + 8} ${qrCount + 8}`} role="img" aria-label="QR code for https://gtn.24071999.xyz" shapeRendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d={qrPath} fill="black"/></svg></div></article>
}
export function ConfiguredGameSlide({ game, kind, step }: { game: GameId; kind: 'rules' | 'bonuses' | 'example' | 'cave-decisions' | 'cave-collapse' | 'circle-received' | 'bomb-worth' | 'bomb-buckets' | 'input' | 'modifiers'; step: number }) {
  const { state } = usePresentationStage()
  if (!state.data) return <StageUnavailable />
  const config = state.data.config
  if (kind === 'bomb-worth') return <BombBalanceSlide config={config}/>
  if (kind === 'bomb-buckets') return <BombBucketsSlide config={config} step={step}/>
  if (kind === 'circle-received') return <CircleReceivedSlide config={config}/>
  if (kind === 'cave-decisions') return <CaveDecisionSlide config={config}/>
  if (kind === 'cave-collapse') return <CaveCollapseSlide config={config}/>
  if (kind === 'example') return <HighLowExampleSlide config={config} step={step} />
  if (kind === 'bonuses') return <BonusRulesSlide config={config} />
  if (kind === 'rules') return <GameInstructionSlide game={game} config={config} step={step} />
  if (kind === 'input') return <GameInputDemoSlide game={game} config={config} step={step} />
  return <GameModifiersSlide game={game} config={config} />
}
export function RoundSummary({ game, round }: { game: GameId; round: number }) {
  const { state } = usePresentationStage()
  if (!state.data) return null
  const c = state.data.config, r = round - 1
  const multiplier = game === 'bonus' ? c.bonus.multiplier[r] : game === 'high-low' ? c.highLow.multiplier[r] : game === 'cave' ? c.cave.growth[r] : game === 'circle' ? c.circle.multiplier[r] : c.bomb.factor[r]
  return <div className="round-rule-summary"><div className={`round-multiplier${game === 'high-low' ? ' round-choice-range' : ''}`}><strong>{game === 'high-low' ? `0–${(c.highLow.pool[r] * multiplier).toLocaleString('en-US')}` : <><span>×</span>{multiplier}</>}</strong><span>{game === 'bonus' ? `take 0–${c.bonus.bag[r]} · total ≤ ${c.bonus.threshold[r]}` : game === 'high-low' ? 'Choose your amount' : game === 'cave' ? `start ${c.cave.startingMoney[r]} · ${c.cave.tickSeconds}s · ${c.cave.maxTicks} windows` : game === 'circle' ? 'money + stars sent' : `up × / down ÷ · ${c.bomb.maxChits} chits per pile`}</span></div>
    <div className="round-rule-visual">{game === 'bonus' ? <><span>Your take</span><b>×</b><span>threshold bonus</span><b>×</b><span>zero teams <small>at least 1</small></span></> : game === 'high-low' ? <><span>Lowest choice<small>gets highest amount</small></span><ArrowRight/><span>Everyone else<small>gets lowest amount</small></span></> : game === 'cave' ? <><span>Stay<small>grow + risk</small></span><b>/</b><span>Leave<small>bank safely</small></span><span>Collapse<small>inside = 0</small></span></> : game === 'circle' ? <><span>Send ×{multiplier}</span><ArrowRight/><span>Receive</span><ArrowRight/><span>Return ×1</span></> : <><span>Direction pile<small>↑ / ↓</small></span><b>+</b><span>Recipient pile<small>one team</small></span></>}</div>
    <p className="round-star-rule"><Star aria-hidden="true"/>{game === 'bonus' ? round === 3 ? `${c.bonus.stars} to highest payout` : 'Stars awarded in round 3' : game === 'high-low' ? round === 3 ? `${c.highLow.stars} to lowest-choice winner` : 'Stars awarded in round 3' : game === 'cave' ? `${c.cave.stars} for most banked across all 3 rounds` : game === 'circle' ? 'Stars multiply · no new award' : 'No new stars'}</p>
  </div>
}
export function DiscussionSlide({ game, round }: { game: GameId; round: number }) {
  const { mode } = usePresentationStage()
  const timer = useDiscussionClock(game, round, mode === 'screen')
  return <article className="welcome-slide" aria-label={`${gameNames[game]} round ${round} discussion`}><header className="theory-heading round-heading"><h1>{gameNames[game]}</h1><p>Round {round} · Make a deal</p></header><div className="discussion-layout"><section className="discussion-rules"><GameMark game={game} /><RoundSummary game={game} round={round}/></section><div className={`discussion-timer${timer.remaining === 0 ? ' has-ended' : ''}`} role="timer" aria-label="Discussion time remaining"><strong>{displayClock(timer.remaining)}</strong><span>{timer.remaining === 0 ? 'Time to decide' : 'Discussion'}</span></div></div></article>
}
export function StartRoundSlide({ game, round }: { game: GameId; round: number }) {
  const { state } = usePresentationStage()
  const p = state.data?.progress
  const current = p?.game === game && p.round === round
  const active = current && !['ready', 'complete'].includes(p.phase)
  const completed = current && (p.phase === 'complete' || p.status === 'finished')
  if (game === 'cave' && active && state.data?.cave) return <CaveLiveSlide round={round} cave={state.data.cave} paused={p.publicRevealActive} connectionLost={state.isError}/>
  return <article className="welcome-slide" aria-label={`${gameNames[game]} round ${round} start`}><div className="round-start-scene"><GameMark game={game}/><p>{gameNames[game]} · Round {round}</p><h1>{completed ? 'Round complete' : active ? 'Make your move' : 'Ready to decide?'}</h1><div className="round-start-symbol"><Flag aria-hidden="true"/><span>{completed ? 'On to the next round' : active ? 'Submit on your phone' : 'Your host will start the round'}</span></div></div></article>
}
export function StarTradingSlide() {
  const { state } = usePresentationStage()
  const data = state.data
  return <article className="welcome-slide" aria-label="Trade stars before the finale"><header className="theory-heading"><h1>One last deal</h1><p>Trade your stars before the finale.</p></header><div className="star-trade-scene"><div className="star-trade-route"><Star/><ArrowRight/><Star/></div><h2>Wallet → Send stars</h2><p>Agree on a deal. Send stars. Pay through Send money.</p><small>Trading closes when the finale starts. Only team leaders can send.</small><div className="star-trade-totals">{data?.teams.map(team => <div key={team.id}><span>{team.name}</span><strong><Star/>{team.stars}</strong></div>)}</div></div></article>
}
