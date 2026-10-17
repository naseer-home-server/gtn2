import type { ReactNode } from 'react'
import type { GameId } from 'backend/game'
import './game-instruction-slides.css'

const titles: Record<GameId, string> = {
  bonus: 'Will we get a bonus this year?',
  'high-low': 'High or low',
  cave: 'Cave mining',
  circle: 'What goes around comes around',
  bomb: 'Gamble bomb',
}

export function Frame({ children, game, label, heading, ariaLabel, className = '' }: { children: ReactNode; game: GameId; label: string; heading?: string; ariaLabel?: string; className?: string }) {
  return <article className={`welcome-slide game-instruction game-instruction-${game} ${className}`} aria-label={ariaLabel ?? `${titles[game]}: ${label}`}>
    <header className="theory-heading"><h1>{heading ?? titles[game]}</h1></header>{children}
    <svg className="game-rule-frame" viewBox="0 0 1600 900" aria-hidden="true"><path d="M76 36H1524A40 40 0 0 0 1564 76V824A40 40 0 0 0 1524 864H76A40 40 0 0 0 36 824V76A40 40 0 0 0 76 36Z" /></svg>
  </article>
}
