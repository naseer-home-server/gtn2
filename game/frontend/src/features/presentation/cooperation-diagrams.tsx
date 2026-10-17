export type CooperationState = 'cooperate' | 'one-defects' | 'all-defect'

function Person({ x, y, idle = false, you = false }: { x: number; y: number; idle?: boolean; you?: boolean }) {
  const ink = you ? '#b80712' : '#393733'
  return <g transform={`translate(${x} ${y})`} stroke={ink} strokeWidth="3" strokeLinecap="round" fill="none">
    <circle cx="0" cy="-14" r="6" fill={ink} stroke="none" />
    <path d={idle ? 'M0-4L-12 17H12M-12 17L-17 29M2 17L17 27M-3 1L14 2L18-6' : 'M0-4V16M0 16L-10 29M0 16L10 29M0 2L-12 12M0 2L14 6'} />
  </g>
}

function Check({ x, y }: { x: number; y: number }) {
  return <path d={`M${x - 7} ${y}l5 5 11-13`} fill="none" stroke="#393733" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
}

export function KitchenScene({ state }: { state: CooperationState }) {
  const dirty = state === 'all-defect'
  const shirker = state === 'one-defects'
  return <svg className="cooperation-scene" viewBox="0 0 300 120" role="img" aria-label={dirty ? 'Everyone skips cleaning: dishes pile up and the kitchen is dirty.' : shirker ? 'Others clean while you relax: you enjoy a clean kitchen without doing the work.' : 'Everyone cleans: all enjoy a clean kitchen.'}>
    <path d="M16 87H283M35 87V110M263 87V110" stroke="#bfb4a4" fill="none" strokeWidth="3" />
    <rect x="95" y="58" width="113" height="28" rx="4" fill="#ece6dc" />
    <ellipse cx="151" cy="72" rx="39" ry="9" fill="#f4f0e8" stroke="#bfb4a4" strokeWidth="2" />
    <path d="M145 58V42Q145 28 162 32V45" stroke="#393733" fill="none" strokeWidth="3" />
    {dirty ? <g fill="#f4f0e8" stroke="#b80712" strokeWidth="2.5">
      <path d="M112 73Q151 95 190 73M109 64Q151 87 193 64M115 54Q151 78 187 54M125 45Q151 67 177 45" />
      <path d="M80 62l7-5m-6-5 6 9m135 1 7-5m-6-5 6 9M126 34q-8-10 0-18m42 14q8-9 0-17" />
    </g> : <g>
      <Person x={78} y={53} /><Person x={224} y={53} you idle={shirker} />
      {shirker ? <path d="M205 90V68H239V90M202 90H243" fill="none" stroke="#b80712" strokeWidth="2" /> : <path d="M233 60l10-8m-9 2 5 9" stroke="#393733" strokeWidth="2" />}
      <path d="M96 67l7-7m0 12 5-4" stroke="#393733" strokeWidth="2" /><Check x={152} y={99} />
    </g>}
  </svg>
}

export function ProjectScene({ state }: { state: CooperationState }) {
  const abandoned = state === 'all-defect'
  const shirker = state === 'one-defects'
  return <svg className="cooperation-scene" viewBox="0 0 300 120" role="img" aria-label={abandoned ? 'Everyone free-rides: no one finishes the group project and everyone loses the shared result.' : shirker ? 'Your teammates do the work: you get the same credit without contributing.' : 'Everyone contributes: the group finishes a strong project.'}>
    <path d="M126 14H177L190 27V103H126ZM177 14V28H190" fill="#fffcf7" stroke="#bfb4a4" strokeWidth="2" />
    {!abandoned && <g stroke="#393733" strokeWidth="2"><path d="M138 43H177M138 52H174M138 61H165" /><Check x={155} y={83} /></g>}
    {abandoned && <path d="M144 56L172 84M172 56L144 84" stroke="#b80712" strokeWidth="3" />}
    <Person x={69} y={57} idle={abandoned} /><Person x={232} y={57} idle={abandoned || shirker} you={shirker} />
    {!abandoned && <path d="M89 69L115 57M105 57H115V67" fill="none" stroke="#a99d8d" strokeWidth="2" />}
    {!abandoned && !shirker && <path d="M213 69L198 57M198 67V57H208" fill="none" stroke="#a99d8d" strokeWidth="2" />}
    {!abandoned && <g fill="none" stroke={shirker ? '#b80712' : '#393733'} strokeWidth="2"><path d="M234 12l3 7 8 1-6 5 1 8-6-4-7 4 2-8-6-5 8-1Z" /><path d="M70 12l3 7 8 1-6 5 1 8-6-4-7 4 2-8-6-5 8-1Z" stroke="#393733" /></g>}
  </svg>
}

function Fish({ x, y, red = false }: { x: number; y: number; red?: boolean }) {
  return <g transform={`translate(${x} ${y})`} fill={red ? '#b80712' : '#756b5e'}><ellipse rx="10" ry="5" /><path d="M-8 0L-17-7V7Z" /><circle cx="5" cy="-1" r="1.2" fill="#f4f0e8" /></g>
}

function Boat({ x, red = false }: { x: number; red?: boolean }) {
  return <g transform={`translate(${x} 19)`} stroke={red ? '#b80712' : '#393733'} strokeWidth="2" fill="none"><path d="M-27 2H27L16 15H-17ZM-2 2V-12H13V2" /><path d="M23 10Q43 24 32 48" /></g>
}

export function FisheryScene({ state }: { state: CooperationState }) {
  const depleted = state === 'all-defect'
  const overfisher = state === 'one-defects'
  return <svg className="cooperation-scene" viewBox="0 0 300 120" role="img" aria-label={depleted ? 'Everyone overfishes: the shared fish stock is depleted and future catches fall for all.' : overfisher ? 'Others limit their catch: your larger net earns you a bigger catch now.' : 'Everyone limits their catch: fish remain to sustain future catches for all.'}>
    <path d="M17 44Q32 36 47 44T77 44T107 44T137 44T167 44T197 44T227 44T257 44T287 44M18 109H282" stroke="#bfb4a4" strokeWidth="2" fill="none" />
    <Boat x={76} red={depleted} /><Boat x={222} red={overfisher || depleted} />
    {!depleted && <><Fish x={56} y={78} /><Fish x={118} y={96} /><Fish x={172} y={72} /><Fish x={257} y={97} /></>}
    {overfisher && <g fill="none" stroke="#b80712" strokeWidth="1.6"><path d="M194 50H271L260 85H205ZM201 50L214 85M216 50L228 85M232 50L241 85M248 50L254 85M199 63H267M203 75H263" /><Fish x={226} y={61} red /><Fish x={244} y={75} red /></g>}
    {depleted && <g fill="none" stroke="#b80712" strokeWidth="2"><path d="M42 53H106L96 90H52ZM190 53H254L244 90H200ZM42 53L96 90M106 53L52 90M190 53L244 90M254 53L200 90" /></g>}
    {state === 'cooperate' && <><Fish x={210} y={91} /><Fish x={91} y={64} /></>}
  </svg>
}
