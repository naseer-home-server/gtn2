import type { GameId } from 'backend/game'

/** Decorative, game-specific marks. Never encode a choice or hidden result. */
export function GameMark({ game }: { game: GameId | null | undefined }) {
  return <svg className="game-mark" viewBox="0 0 80 80" fill="none" aria-hidden="true">
    {game === 'high-low' ? <>
      <rect x="12" y="17" width="35" height="49" rx="7" transform="rotate(-12 12 17)" fill="#FFFDFA" stroke="#D5CABE" />
      <path d="M31 52V30m0 0-7 8m7-8 7 8" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="39" y="12" width="35" height="49" rx="7" transform="rotate(10 39 12)" fill="#B80712" />
      <path d="m54 29-4 22m0 0-6-9m6 9 9-6" stroke="#FFFDFA" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </> : game === 'cave' ? <>
      <path d="m16 30 15-14h25l12 16-28 35Z" fill="#B80712" />
      <path d="m16 30 25 4 27-2M31 16l10 18 15-18M41 34l-1 33M16 30l24 37 28-35" stroke="#FFFDFA" strokeWidth="1.2" opacity=".65" />
      <path d="m14 14 2-6m-8 8-6-1m63 44 6 3" stroke="#B80712" strokeWidth="2" strokeLinecap="round" />
    </> : game === 'circle' ? <>
      <path d="M24 24c15-15 39-5 39 14m-3 15c-14 16-40 9-43-10" stroke="#000" strokeWidth="2" strokeLinecap="round" />
      <path d="m58 32 5 7 6-6M22 48l-5-7-6 6" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="26" cy="24" r="9" fill="#B80712" /><circle cx="56" cy="54" r="9" fill="#B80712" /><circle cx="23" cy="53" r="9" fill="#FFFDFA" stroke="#D5CABE" />
      <path d="M22 24h8m-4-4v8m26 26h8m-33-1h-8" stroke="#FFFDFA" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M19 53h8" stroke="#000" strokeWidth="1.5" strokeLinecap="round" />
    </> : game === 'bomb' ? <>
      <circle cx="36" cy="47" r="23" fill="#000" /><path d="M21 45c0-8 5-13 11-14" stroke="#FFFDFA" strokeWidth="2" strokeLinecap="round" opacity=".6" />
      <path d="m45 23 7-9 9 7-8 9" fill="#B80712" /><path d="m57 16 4-8 7 3" stroke="#000" strokeWidth="2" strokeLinecap="round" />
      <path d="m70 7 3-4m1 11 5 1m-9 5 2 5" stroke="#B80712" strokeWidth="2" strokeLinecap="round" />
    </> : <>
      <ellipse cx="32" cy="56" rx="22" ry="9" fill="#B80712" /><path d="M10 47v9c0 5 10 9 22 9s22-4 22-9v-9" fill="#B80712" stroke="#FFFDFA" strokeWidth="1.2" />
      <ellipse cx="32" cy="47" rx="22" ry="9" fill="#FFFDFA" stroke="#B80712" strokeWidth="1.5" /><path d="M10 38v9c0 5 10 9 22 9s22-4 22-9v-9" fill="#B80712" stroke="#FFFDFA" strokeWidth="1.2" /><ellipse cx="32" cy="38" rx="22" ry="9" fill="#B80712" stroke="#FFFDFA" strokeWidth="1.2" />
      <circle cx="54" cy="29" r="17" fill="#FFFDFA" stroke="#B80712" strokeWidth="1.5" /><circle cx="54" cy="29" r="12" stroke="#B80712" strokeWidth="1" /><path d="M54 22v14m4-12h-5a3 3 0 0 0 0 6h2a3 3 0 0 1 0 6h-5" stroke="#B80712" strokeWidth="1.5" strokeLinecap="round" />
    </>}
  </svg>
}
