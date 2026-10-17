function Prisoners() {
  return <svg className="prisoner-illustration" viewBox="0 0 400 210" role="img" aria-label="You and the other prisoner are questioned separately and cannot communicate.">
    {[{ x: 0, color: '#b80712', name: 'You' }, { x: 225, color: '#393733', name: 'Them' }].map(({ x, color, name }) => <g key={name} transform={`translate(${x} 0)`}>
      <rect x="10" y="10" width="155" height="150" rx="7" fill="#ece6dc" />
      <circle cx="87" cy="65" r="23" fill={color} />
      <path d="M41 144V125C41 88 133 88 133 125V144Z" fill={color} />
      <path d="M40 10V160M88 10V160M136 10V160" stroke="#f4f0e8" strokeWidth="7" />
      <text x="87" y="198" textAnchor="middle" fill={color} fontSize="23">{name}</text>
    </g>)}
    <path d="M200 12V157" stroke="#b8ad9d" strokeWidth="2" strokeDasharray="6 6" />
  </svg>
}

function PrisonYears({ you, them }: { you: number; them: number }) {
  return <><span className="prison-years-you">{you}</span><span className="prison-years-divider">/</span><span>{them}</span></>
}

export function GameTheorySlide({ step }: { step: number }) {
  return <article className="welcome-slide theory-slide" aria-label="Game theory slide">
    <header className="theory-heading">
      <h1>Game theory</h1>
      <p>Your best strategy depends on others’ actions.</p>
    </header>
    <div className="dilemma-layout">
      <section className="dilemma-story" aria-labelledby="dilemma-title">
        <h2 id="dilemma-title">Prisoner’s dilemma</h2>
        <Prisoners />
        <p>Separated. No talking.</p>
      </section>
      <div className="dilemma-matrix">
        {step >= 1 && <table className="slide-reveal" aria-label="Prisoner’s dilemma: years in prison for you and them">
          <caption>Years in prison <span className="prison-years-you">You</span> / Them</caption>
          <thead><tr><td>You ↓ <span>Them →</span></td><th scope="col">Stay silent</th><th scope="col">Betray</th></tr></thead>
          <tbody>
            <tr><th scope="row">Stay silent</th><td aria-label="You: 1 year. Them: 1 year."><PrisonYears you={1} them={1} /></td><td aria-label="You: 10 years. Them: 0 years."><PrisonYears you={10} them={0} /></td></tr>
            <tr><th scope="row">Betray</th><td aria-label="You: 0 years. Them: 10 years."><PrisonYears you={0} them={10} /></td><td className="dilemma-trap" aria-label="You: 5 years. Them: 5 years."><PrisonYears you={5} them={5} /></td></tr>
          </tbody>
        </table>}
        {step >= 2 && <p className="dilemma-takeaway slide-reveal">Both tempted to betray. Both worse off.</p>}
      </div>
    </div>
  </article>
}
