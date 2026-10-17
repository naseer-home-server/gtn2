import { Bot, Coins, Send } from 'lucide-react'

const silverAward = '/brand/awards/ai-silver-cartoon.png'
const goldAward = '/brand/awards/most-devious-gold-cartoon.png'

const aiAgents = Array.from({ length: 7 }, (_, index) => index + 1)
const bubbleWidths = ['70%', '52%', '61%', '75%', '46%', '66%', '55%']

export function AiSimulationSlide() {
  return <article className="welcome-slide ai-simulation-slide" aria-label="One more thing slide">
    <header className="theory-heading"><h1>One more thing…</h1></header>
    <div className="ai-chat-window" role="img" aria-label="Seven AI agents discussing in a group chat, illustrated with empty message bubbles. Each agent has an earnings field; actual amounts are not shown.">
      <div className="ai-chat-window-header"><h2>7 AI agents</h2><div className="ai-chat-avatars" aria-hidden="true">{aiAgents.map(agent => <span key={agent}><Bot /></span>)}</div></div>
      <div className="ai-chat-window-body">
        <div className="ai-chat-conversation" aria-hidden="true">
          <div className="ai-chat-messages">{aiAgents.map((agent, index) => <div key={agent} className={`ai-chat-message${index % 3 === 1 ? ' is-right' : ''}`}>
            <span className="ai-chat-message-avatar"><Bot /><small>{agent}</small></span><span className="ai-chat-bubble" style={{ width: bubbleWidths[index] }} />
          </div>)}</div>
          <div className="ai-chat-composer"><span /><Send /></div>
        </div>
        <div className="ai-chat-earnings">
          <h3>Earnings</h3>
          <div>{aiAgents.map(agent => <div className="ai-chat-earnings-row" key={agent}><Bot aria-hidden="true" /><span>Agent {agent}</span><span className="ai-chat-earnings-value" aria-label="Amount not shown"><Coins aria-hidden="true" /><span aria-hidden="true">•••</span></span></div>)}</div>
        </div>
      </div>
    </div>
  </article>
}

export function PrizesSlide({ step }: { step: number }) {
  return <article className="welcome-slide prizes-slide" aria-label="Prizes slide">
    <header className="theory-heading"><h1>The prizes</h1></header>
    <div className="prizes-layout">
      <section className="prize-item silver-prize">
        <img src={silverAward} alt="Cartoon silver Will not be replaced by AI award" />
        <h2>Will not be replaced by AI</h2><p>Beat the AI average</p>
      </section>
      <div className="gold-prize-slot">{step >= 1 && <section className="prize-item gold-prize slide-reveal">
        <img src={goldAward} alt="Cartoon gold and red Most Devious award" />
        <h2>Most Devious</h2><p>Highest team earnings</p>
      </section>}</div>
    </div>
  </article>
}

export function AwardEligibilitySlide() {
  return <article className="welcome-slide eligibility-slide" aria-label="Award eligibility slide">
    <header className="theory-heading"><h1>One important rule</h1></header>
    <div className="eligibility-layout">
      <div className="eligibility-message">
        <p className="eligibility-leadin">To qualify for</p>
        <h2>Most Devious</h2>
        <div className="eligibility-comparison" role="img" aria-label="Your team's score must be strictly greater than the average AI score."><span>Your score</span><strong aria-hidden="true">&gt;</strong><span>AI average</span></div>
      </div>
      <div className="eligibility-award-slot"><img src={goldAward} alt="Most Devious award, available only to a team that beats the AI average" /></div>
    </div>
  </article>
}
