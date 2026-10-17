import { GameMark } from '@/features/player/game-mark'

const tonightGames = ['bonus', 'high-low', 'cave', 'circle', 'bomb'] as const

function Team({ x, y, betray = false, scale = 1 }: { x: number; y: number; betray?: boolean; scale?: number }) {
  const ink = betray ? '#b80712' : '#393733'
  return <g transform={`translate(${x} ${y}) scale(${scale})`} fill={ink}>
    <circle cx="-15" cy="-15" r="9" /><circle cx="15" cy="-15" r="9" />
    <path d="M-29 18V7C-29-8-1-8-1 7V18ZM1 18V7C1-8 29-8 29 7V18Z" />
  </g>
}

function CoinStack({ x, count, red = false }: { x: number; count: number; red?: boolean }) {
  const ink = red ? '#b80712' : '#756b5e'
  return <g transform={`translate(${x} 0)`}>{Array.from({ length: count }, (_, i) => <g key={i} transform={`translate(0 ${198 - i * 11})`}>
    <path d="M-24-5V3C-24 13 24 13 24 3V-5" fill={ink} stroke="#f4f0e8" strokeWidth="1.3" />
    <ellipse cy="-5" rx="24" ry="9" fill={ink} stroke="#f4f0e8" strokeWidth="1.3" />
  </g>)}</g>
}

function CooperationStakes({ step }: { step: number }) {
  return <svg className="plan-stakes-illustration" viewBox="0 0 1200 285" role="img" aria-label={['All teams cooperate: everyone gains more. Conceptual coin stacks, not game payouts.', 'One team betrays: its own earnings fall below cooperation, but everyone else loses much more, giving the betrayer a relative lead.', 'If all teams betray, everyone ends with less than under cooperation.'].slice(0, step + 1).join(' ')}>
    {[0, 1, 2].filter(stage => stage <= step).map(stage => <g className="slide-reveal" key={stage} transform={`translate(${stage * 410} 0)`}>
      {[0, 1, 2].map(team => {
        const betray = stage === 2 || (stage === 1 && team === 0)
        return <g key={team}><Team x={66 + team * 110} y={63} betray={betray} /><CoinStack x={66 + team * 110} count={stage === 0 ? 6 : stage === 1 ? team === 0 ? 4 : 1 : 1} red={betray} /></g>
      })}
      <text x="176" y="269" textAnchor="middle" fill={stage === 1 ? '#b80712' : '#393733'} fontSize="24">{['All cooperate', 'Betray to lead', 'All betray'][stage]}</text>
    </g>)}
    <g fill="none" stroke="#bfb4a4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">{step >= 1 && <path d="M354 133H387L378 124M387 133L378 142" />}{step >= 2 && <path d="M764 133H797L788 124M797 133L788 142" />}</g>
  </svg>
}

export function PlanSlide({ step }: { step: number }) {
  return <article className="welcome-slide plan-slide" aria-label="Plan for today slide">
    <header className="theory-heading"><h1>Plan for today</h1></header>
    <div className="plan-format">
      <section className="plan-five-games" aria-labelledby="plan-games-title"><h2 id="plan-games-title">5 games</h2><div className="plan-game-marks" aria-hidden="true">{tonightGames.map(game => <GameMark game={game} key={game} />)}</div></section>
      <section className="plan-pairs" aria-labelledby={step >= 1 ? "plan-team-title" : undefined}>{step >= 1 && <div className="plan-pair-reveal slide-reveal"><h2 id="plan-team-title">Teams of 2</h2><svg viewBox="0 0 180 85" fill="none" aria-hidden="true"><rect x="18" y="5" width="144" height="75" rx="36" stroke="#b80712" strokeWidth="1.5" /><Team x={90} y={47} scale={1.25} /></svg></div>}</section>
    </div>
  </article>
}

export function TemptationSlide({ step }: { step: number }) {
  return <article className="welcome-slide temptation-slide" aria-label="The temptation slide">
    <header className="theory-heading"><h1>The temptation</h1></header>
    <div className="temptation-stakes"><CooperationStakes step={step} /></div>
  </article>
}
