import { KitchenScene, ProjectScene, FisheryScene } from './cooperation-diagrams'
import type { CooperationState } from './cooperation-diagrams'

const situations = [
  { name: 'Shared kitchen', Scene: KitchenScene, captions: ['Clean kitchen', 'Clean. No effort.', 'Everyone’s mess'] },
  { name: 'Group project', Scene: ProjectScene, captions: ['Shared success', 'Credit. No effort.', 'Nothing finished'] },
  { name: 'Shared fishery', Scene: FisheryScene, captions: ['Fish for tomorrow', 'Bigger catch now', 'Empty nets later'] },
]
const choices: { state: CooperationState; label: string }[] = [
  { state: 'cooperate', label: 'Everyone cooperates' },
  { state: 'one-defects', label: 'One defects' },
  { state: 'all-defect', label: 'Everyone defects' },
]

export function RealLifeSlide({ step }: { step: number }) {
  return <article className="welcome-slide real-life-slide" aria-label="Real-life games slide">
    <header className="theory-heading"><h1>Games in real life</h1></header>
    <table className="cooperation-grid" aria-label="Everyday cooperation dilemmas: shared benefit, individual temptation, and collective loss">
      <thead><tr><td /><th scope="col">{choices[0].label}</th><th scope="col">{choices[1].label}</th><th scope="col">{choices[2].label}</th></tr></thead>
      <tbody>{situations.map(({ name, Scene, captions }, position) => <tr key={name} aria-hidden={position > step || undefined}>
        <th scope="row">{position <= step && <span className="slide-reveal">{name}</span>}</th>
        {choices.map(({ state }, index) => <td key={state}>{position <= step && <div className="slide-reveal"><Scene state={state} /><p>{captions[index]}</p></div>}</td>)}
      </tr>)}</tbody>
    </table>
  </article>
}
