import './circle-flow-diagram.css'

const center = { x: 320, y: 290 }
const radius = 218
const point = (angle: number, distance = radius) => ({ x: center.x + Math.cos(angle * Math.PI / 180) * distance, y: center.y + Math.sin(angle * Math.PI / 180) * distance })
function arrowHead(x: number, y: number, dx: number, dy: number) {
  const length = Math.hypot(dx, dy), ux = dx / length, uy = dy / length
  return `M${x} ${y}L${x - ux * 14 - uy * 7} ${y - uy * 14 + ux * 7}L${x - ux * 14 + uy * 7} ${y - uy * 14 - ux * 7}Z`
}

export function CircleFlowDiagram({ multiplier, showReturn = false, playerView = false }: { multiplier: number; showReturn?: boolean; playerView?: boolean }) {
  const factor = `×${multiplier.toLocaleString('en-US')}`
  const factorWidth = Math.max(54, factor.length * 14 + 14)
  return <figure className={`circle-flow-diagram${playerView ? ' circle-player-view' : ''}`}>
    <svg viewBox="0 0 640 580" role="img" aria-label={playerView ? `Fictional Team 1 view after everyone sends. You see Team 7 as your sender, ${20 * multiplier} dollars received and ${multiplier} stars received. Other positions are anonymous. Your recipient and the circle order are hidden.` : `Illustrative seven-team circle. Money and stars flow clockwise: Team 1 to 2, 2 to 3, 3 to 4, 4 to 5, 5 to 6, 6 to 7, and 7 to 1. Each send is multiplied by ${multiplier}.${showReturn ? ' Team 2 may return some to Team 1, unmultiplied.' : ''}`}>
      {Array.from({ length: 7 }, (_, i) => {
        if (playerView && i !== 6) return null
        const angle = -90 + i * 360 / 7, startAngle = angle + 14, endAngle = angle + 360 / 7 - 14
        const start = point(startAngle), end = point(endAngle), label = point(angle + 180 / 7, 248)
        const tangent = (endAngle + 90) * Math.PI / 180
        return <g className="circle-flow-link" key={i}>
          <path className="circle-flow-arc" d={`M${start.x} ${start.y}A${radius} ${radius} 0 0 1 ${end.x} ${end.y}`}/>
          <path className="circle-flow-arrow" d={arrowHead(end.x, end.y, Math.cos(tangent), Math.sin(tangent))}/>
          <rect x={label.x - factorWidth / 2} y={label.y - 17} width={factorWidth} height="34" rx="17"/>
          <text x={label.x} y={label.y + 8} textAnchor="middle">{factor}</text>
        </g>
      })}
      {showReturn && <g className="circle-return-link">
        <path className="circle-return-arc" d="M452 183Q362 226 320 122"/>
        <path className="circle-return-arrow" d={arrowHead(320, 122, -42, -104)}/>
        <rect x="333" y="191" width="126" height="32" rx="16"/>
        <text x="396" y="213" textAnchor="middle">Return ×1</text>
      </g>}
      {playerView ? <g className="circle-private-receipt">
        <rect x="218" y="229" width="204" height="125" rx="12"/>
        <text className="circle-receipt-label" x="320" y="261" textAnchor="middle">You received</text>
        <text className="circle-receipt-money" x="320" y="305" textAnchor="middle">${(20 * multiplier).toLocaleString('en-US')}</text>
        <text className="circle-receipt-stars" x="320" y="335" textAnchor="middle">{multiplier} {multiplier === 1 ? 'star' : 'stars'}</text>
      </g> : <>
        <text className="circle-flow-center" x="320" y="291" textAnchor="middle">Money + stars</text>
        <text className="circle-flow-direction" x="320" y="320" textAnchor="middle">Send clockwise</text>
      </>}
      {Array.from({ length: 7 }, (_, i) => {
        const node = point(-90 + i * 360 / 7)
        const unknown = playerView && i !== 0 && i !== 6
        return <g className={`circle-flow-team${unknown ? ' is-anonymous' : playerView && i === 0 ? ' is-you' : ''}`} key={i} transform={`translate(${node.x} ${node.y})`}>
          <circle r="42"/>
          {!unknown && <g className="circle-team-pair" aria-hidden="true"><circle cx="-10" cy="-16" r="6"/><circle cx="10" cy="-16" r="6"/><path d="M-21 2v-8c0-9 22-9 22 0v8M1 2v-8c0-9 22-9 22 0v8"/></g>}
          <text y={unknown ? 11 : 24} textAnchor="middle">{unknown ? '?' : playerView && i === 0 ? 'You' : `Team ${i + 1}`}</text>
        </g>
      })}
    </svg>
    <figcaption>{playerView ? 'Team 1’s view after transfers · Fictional example' : 'Round 1 example · Real circles stay hidden.'}</figcaption>
  </figure>
}
