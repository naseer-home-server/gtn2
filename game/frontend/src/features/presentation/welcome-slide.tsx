/** Audience-facing content only. Keep host controls and private game data outside slides. */
export function WelcomeSlide() {
  return <article className="welcome-slide" aria-label="Welcome slide">
    <svg className="welcome-frame" viewBox="0 0 1600 900" fill="none" aria-hidden="true">
      <path d="M76 36H1524A40 40 0 0 0 1564 76V824A40 40 0 0 0 1524 864H76A40 40 0 0 0 36 824V76A40 40 0 0 0 76 36Z" />
    </svg>
    <div className="welcome-composition">
      <div className="welcome-copy">
        <p className="welcome-greeting">Welcome to</p>
        <h1 className="welcome-title"><span>Game Theory</span><span>Night 2</span></h1>
      </div>
      <img className="welcome-die" src="/brand/die.svg" alt="" draggable="false" />
    </div>
    <div className="welcome-footer">
      <p className="welcome-question">Do you trust your friends?</p>
    </div>
  </article>
}
