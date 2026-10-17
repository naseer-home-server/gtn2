import { formatMoney } from '@/lib/game-display'
import { Frame } from './game-slide-frame'
import { usePresentationStage } from './use-presentation-stage'
import { standingsScale, type FinalStandings } from './final-standings-model'
import './final-standings-slide.css'

export function FinalStandingsBoard({ standings, step }: { standings: FinalStandings; step: number }) {
  const count = standings.entries.length, visible = Math.min(count, step + 1), showAverage = step >= count
  const scale = standingsScale(standings)
  return <Frame game="bomb" label="final standings" ariaLabel="Final standings slide" heading="Final standings" className="final-standings-slide">
    <div className="standings-head"><span>Rank</span><span>Team</span><span/><span>Final earnings</span></div>
    <div className="standings-chart">
      <ol className="standings-rows" aria-label="Final team standings">{standings.entries.map(team => {
        const revealed = team.rank > count - visible
        return <li key={team.teamId} className={revealed ? 'is-revealed' : ''} aria-hidden={!revealed}>{revealed && <><span className="standings-rank">{team.rank}</span><strong className="standings-name">{team.name}</strong><div className="standings-bar"><span style={{width:`${scale(team.earnings)}%`}}/></div><strong className="standings-earnings">${formatMoney(team.earnings)}</strong></>}</li>
      })}</ol>
      {showAverage && <div className="standings-average-area"><div className="standings-average-line" style={{left:`${scale(standings.modelAverage)}%`}}/><div className="standings-average-label" style={{left:`${scale(standings.modelAverage)}%`}}><span>AI average</span><strong>${formatMoney(standings.modelAverage)}</strong></div></div>}
    </div>
  </Frame>
}
export function FinalStandingsSlide({step}: {step:number}) {
  const {state} = usePresentationStage()
  if (state.data?.finalStandings) return <FinalStandingsBoard standings={state.data.finalStandings} step={step}/>
  return <Frame game="bomb" label="final standings" ariaLabel="Final standings slide" heading="Final standings"><div className="standings-waiting"><h2>One last reveal.</h2><p>{state.isError ? 'Waiting to reconnect to the game.' : 'Results after the finale.'}</p></div></Frame>
}
