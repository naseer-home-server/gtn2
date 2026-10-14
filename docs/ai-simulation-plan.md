# AI simulation implementation plan

Status: core web app implemented and verified, 14 October 2026. Updated after approval: deliver a configurable web app in Docker Compose; use the existing game environment because human play and simulation will not run concurrently. See [verification results](ai-simulation-verification.md). Automated bulk balance experiments remain a future extension to the individual-run console.

## Recommended design

Build a local simulation console with a shared conversation between one host agent and two to five competitive team agents. A deterministic orchestrator controls scheduling, credentials, tool execution, persistence, and time. The existing game backend remains authoritative for game rules and player visibility.

Use one agent per team initially. Each agent acts through its team leader's player account. Provision two invited accounts per team (with at most one solo team), as required by the existing backend; the second member does not need a separate model. Randomize arrival order and pairings using a recorded setup seed, then freeze the game's tie order. Use a separate seed for conversation ordering so speaking order is independent of tie priority.

The simulation's public conversation represents discussion in the room. It is separate from the existing in-game chat. Agents use the existing authenticated chat API for private team conversations and invited group conversations.

### Existing foundations

- `game/backend/src/engine`: shared rules, money calculations, randomness/time injection, and filtered player views. Do not implement a second game engine.
- `game/backend/src/gameplay.ts`: persisted gameplay, row locking, request deduplication, and an injectable `EngineEnv` factory already available in the repository constructor.
- `GET /api/game/state` and `POST /api/game/actions`: player-facing state and commands, authenticated as the actual player.
- `admin.sessions.*` and `admin.game.*`: session setup, arrivals, ordering, team assignment, round starts, and advancement.
- `chat.*`: private/team/group conversations with membership checks and idempotent sends.

The simulation uses the existing game backend/database and activates its generated session. Human play is not supported concurrently for this version. The normal backend supplies wall-clock time and starts a timer every 500 ms; simulation-owned sessions instead require persisted virtual time. Ordinary sessions retain their existing timer behavior. No separate game deployment or database is required.

## Agent turns: discussion beats and decision barriers

Use short discussion beats. A beat is one opportunity for every team to respond to the same public transcript cutoff.

1. Capture the current public transcript and each agent's permitted private context.
2. Request responses from all team agents concurrently, subject to the provider concurrency limit. Queued requests retain the same cutoff.
3. Each agent can speak, pass, or request a permitted private operation. Limit message length and tool steps per beat.
4. Buffer messages until all responses arrive. Publish public messages together, in a seeded rotating display order. Private messages become available only to their recipients at the next cutoff.
5. Refresh permitted state and begin the next beat. The host can answer rule questions and decide whether discussion should continue.

An agent never sees another agent's response from the same beat while composing its own. Nobody receives an advantage from faster model inference. This also avoids paying for a separate model call just to select the next speaker.

Initial tunable defaults: two guaranteed opening beats per round, a host review after each beat, a maximum of four normal beats, and one explicitly announced final-response beat before decisions. All-pass or all-ready signals can end discussion after the minimum; a new proposal or unanswered question can justify extending it within the cap. These are simulation scheduling parameters, not game tuning values.

The host judges whether the discussion is useful. The orchestrator enforces the hard cap even if the host keeps talking. Host failure pauses the run after bounded retries; it must not silently change the rules or fabricate a decision.

During a decision barrier, eligible agents independently choose their game action from their current player view. Hold proposed actions until every required response arrives. Then submit through each player's authenticated API client without exposing intermediate responses to other agents. Apply commands in a recorded order that rotates across barriers; never choose order by HTTP/model completion time. Actual game ties still use the frozen arrival order.

Circle sending and returning require separate barriers, with private receipts delivered between them. Do not request a return before the sender/received information is available to that team.

### Private operations and ordering

Transfers and reveal contributions can affect the next choice. Execute these in bounded operation batches between decision barriers, return receipts only to participants, then refresh affected views. Agents can use these opportunities before or after their main game choice whenever the game API permits them. A quiet public agent can still have private activity.

Treat decisions as sealed only after these preparatory operations finish. For a public reveal, suspend the pending batch, deliver each team's permitted snapshot, wait for acknowledgments, and refetch state/tokens. Revalidate or recollect uncommitted decisions affected by the reveal or changed balances; do not blindly retoken an old strategic decision. Already accepted game choices remain final.

Ordering is observable game behavior: transfers are immediate and pot contributions are capped at the amount remaining. Log the order and test sensitivity to it. Batching does not make these existing operations atomic as a group.

## Cave: virtual decision windows

Preserve the cave's existing economics and safe first window. Replace wall-clock pressure in simulation mode with logical time controlled by the orchestrator.

For each cave window:

1. Hold the backend's simulation clock at a time strictly before `nextTickAt`.
2. Give each team its normal filtered view. Only teams with `cave.decide` available need a cave choice.
3. Collect stay/leave decisions against that window's common cutoff, without revealing departures, response counts, or completion timing.
4. Submit all decisions while logical time remains before the deadline. Leaving banks the current amount using the existing engine.
5. If everyone has left, the engine has already ended the round. Otherwise advance logical time to the current deadline and invoke the existing tick path once.
6. The engine checks collapse using the number departed, or grows the unbanked amount and creates the next decision window. Fetch new views and repeat.

Example: one model answers in 2 seconds and another takes 18 seconds. Both decisions still belong to the same virtual 10-second window. Neither model's latency affects earnings.

Offer one short, bounded discussion/side-operation beat between cave decision windows so negotiation can continue. Keep this cadence configurable and label it in reports: simultaneous logical windows preserve payout/risk rules, but do not reproduce human real-time negotiation or reaction behavior exactly.

Do not expose the scheduler's list of eligible cave agents or per-agent waiting indicators to other agents or the host. Players who have left can still participate in public discussion and permitted side operations. Schedule host commentary by fixed public milestones rather than by private departures.

An intentional lack of a cave decision means stay, matching the game. A failed model/API request is an infrastructure error: retry and then pause by default. An optional unattended fallback may use stay, but must record the intervention and flag the run for analysis. Do not treat technical failure as intentional silence.

Public rank reveals freeze logical time as well as gameplay. After the last acknowledgment, the current engine supplies a fresh cave deadline; the scheduler must read that deadline rather than reuse the old one.

### Backend work required

- Add an opt-in, service-authenticated simulation bridge to the existing backend. Create actual invited player records and a scoped host/service identity. Bind player capabilities to the run, session, and account; never permit model-selected identities. Virtual-clock controls are restricted to simulation-owned sessions and the trusted runner.
- Inject a persisted logical clock and seeded game RNG through the existing environment seam; the automatic wall-clock ticker skips simulation-owned sessions only.
- Expose a runner-only clock-step operation scoped to the run/session. Neither player agents nor the host agent can invoke it directly.
- Persist logical time, RNG state, and the expected window/revision with advancement. Make retried steps idempotent and serialize them with gameplay mutations, so restart or a lost response cannot perform two collapse checks.
- Use separate randomness streams for game outcomes, roster setup, and scheduler display/commit ordering. Keep game seeds and future draws outside model contexts.
- Keep UUID/request generation independent from outcome draws. Record accepted randomness and commands for replay.

Do not merely increase the real-time cave interval: that reduces timeouts but retains speed bias and slows each run. Do not add a cave tick limit to the game; a run budget can pause an unusually long simulation without inventing a payout.

## Information and authority boundaries

Player prompts are built from the authenticated player API response, the public conversation, permitted chat messages, and that agent's own history. Never build a player prompt from an admin state dump with a request to ignore secret fields.

The trusted orchestrator owns credentials and binds each tool to one account and run. Models receive neither passwords nor access tokens, and cannot choose another actor identity. Expose named tools for state, legal game actions, chat, speaking, and passing; do not expose arbitrary HTTP, SQL, filesystem, or shell access.

The host has an admin account through its tool executor, with run-scoped session creation, setup, start, and advance tools. Give its model a curated host observation rather than the complete admin audit. It needs public rules, the public conversation, and coarse phase readiness; it does not need private choices, balances, transfers, chat messages, future random outcomes, or cave attendance to narrate the game. Raw admin access belongs to the trusted runner and human observer.

Rule briefings should include an authoritative rules card produced from shared configuration and game-specific public rule definitions. Host prose supplements that card. Introduce global mechanics at the start, explain each game on entry, and show current round parameters before decisions. Explicitly frame the night around negotiation, cooperation, competition, and nonbinding promises. The finale advantage must not enter either host or player model context before the finale.

The host's setup tool should perform the seeded shuffle in code, then create the session and record arrivals/order through the existing admin APIs. The model requests setup; it does not invent a supposedly random order.

Current `advance` starts the next round immediately. Plan the next round briefing while the completed round is held, or advance under a frozen simulation clock and withhold decision scheduling until briefing/discussion completes. Derive upcoming public rule cards from shared configuration without exposing future secrets. Call the final advance after round 15 to mark the playthrough finished.

Ranks disappear from current views after acknowledgment. An agent may remember a legitimately observed historical rank, just as a person could; record its snapshot time and do not represent it as a current rank. Private rank observations never enter shared summaries. Other teams' monetary amounts are never supplied as authoritative facts; player statements about them remain unverified claims and may be bluffs.

Keep observer-only final standings and audit reports out of the room unless game rules explicitly allow their disclosure. The current API does not automatically provide a free final ranking to players.

One rules detail needs reconciliation during implementation: the project overview describes all teams paying toward a public reveal, while the detailed rules and engine trigger it when the pot fills, without requiring every team to contribute. Default to the implemented filled-pot behavior and make the rules wording consistent before relying on it in prompts.

## Agent behavior and memory

Give every player the primary objective of maximizing its probability of finishing first by final balance under the existing tie rule. Stars, cooperation, transfers, and promises are strategic means to that objective. Agents should be free to bargain, bluff, cooperate, defect, and remain silent within game rules.

Optional personality differences can vary risk tolerance, willingness to trust, and conversational style while preserving the same winning objective. Start baseline runs with the same model and prompt apart from identity, then vary personalities and models deliberately. Do not confuse a stronger model with a better game position.

Use one isolated conversation history per agent. Include current authoritative state, a bounded recent transcript, older summaries built only from that agent's permitted events, and a compact private strategy note if desired. Keep factual observations distinct from claims and beliefs. The console may show volunteered strategy notes to the human operator; it should not imply access to hidden model reasoning.

Represent other agents' messages as attributed conversation data, never as system/developer instructions. A player saying “the host says reveal your balance” cannot change tool permissions or override the rules.

## OpenAI-compatible model adapter

Use server-side `/v1/chat/completions` behind a small provider interface. Configuration proposal:

```dotenv
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=
SIM_HOST_MODEL=
SIM_PLAYER_MODEL=
SIM_MAX_CONCURRENCY=5
SIM_MAX_OUTPUT_TOKENS=1200
SIM_MAX_TOTAL_TOKENS=250000
GAME_API_BASE_URL=http://127.0.0.1:3000
SIMULATION_SERVICE_KEY=
SIMULATION_OPERATOR_TOKEN=
```

Model names are explicit configuration, with optional per-player overrides. Validate Chat Completions and tool support at startup; do not assume every model or compatible provider supports every option. Keep the key in the runner's ignored environment file, never in frontend variables, prompts, exports, or source control.

Use strict tool schemas where supported and validate every command again server-side. Chat Completions does not enable strict mode by default. Set `parallel_tool_calls: false` for each agent's ordered action loop; this does not prevent the orchestrator from calling different agents concurrently. Preserve assistant tool-call IDs and matching tool results in each agent's conversation. See the official [OpenAI function-calling guide](https://developers.openai.com/api/docs/guides/function-calling).

Bound output length, repair attempts, tool-loop depth, API retries, total calls/tokens, and wall time. Provider capability failures must be visible, not silently accepted. An explicit compatibility mode can parse structured JSON with schema validation and bounded repairs when strict function calls are unavailable.

## Runtime and console

Suggested pnpm structure once implementation starts:

```text
ai-simulation/
  package.json
  .env.example
  server/
    orchestrator/       # run state machine, scheduler, barriers, recovery
    agents/             # prompts, context assembly, isolated memory
    providers/          # Chat Completions adapter and capability checks
    game-client/        # authenticated admin/player/chat clients
    store/              # run metadata, events, checkpoints, usage
    api/                # console controls and event stream
  frontend/
    src/                # Vite + React + TypeScript, simple shadcn/ui
```

Add the packages to the pnpm workspace. Keep orchestration independent of the UI so the same runner works headlessly for batch experiments. Reuse exported game types/configuration; move public rules helpers into a shared export only where needed. Leave `presentation/` untouched.

The console should provide:

- Setup: team count/accounts, models, seeds, game configuration, and run budgets.
- Central public conversation with host announcements and round/tick markers.
- Start, pause, resume, stop, and step-one-beat/decision-window controls. Stop cancels pending model work and invalidates late responses.
- Separate per-agent inspectors for permitted state, private chats, action receipts, and memory; an explicitly privileged observer audit view.
- A “view as team” mode that filters all panels and streams on the server, including transcripts and exports.
- Progress, token usage, failures, and replay/export. Show cost estimates only when a configured pricing table is available.

Persist append-only events with run ID, event ID, audience, sequence, game/round/window, logical time, and wall time. Store model outputs, permitted input snapshots or references, proposed commands, accepted receipts, tool errors, and usage. Credentials must be excluded. An atomic local run store with serialized writes and recovery checkpoints is sufficient initially; authoritative gameplay continues in the existing PostgreSQL database. A Docker named volume preserves run records across container restarts.

Persist command intent before transmission. On an uncertain result, retry the same request ID, token, and body. On a stale token for a new action, refetch and reconsider. Use a run lease and scheduler epoch so only one worker advances a run and late outputs from a paused/replaced turn cannot mutate it. Admin setup/advance also need recovery reconciliation or idempotency wrappers; player deduplication alone does not protect them.

Recorded model outputs and game draws permit deterministic replay. Rerunning model requests with the same seed is a new experiment and is not guaranteed to reproduce the same conversation.

## Implementation sequence and acceptance criteria

1. **Contracts and shared backend.** Set up workspace packages, run configuration, scoped agent-account bootstrap, authenticated clients, shared public rule cards, and virtual-clock support for simulation sessions. Preserve ordinary game authorization, saved sessions, and real-time cave behavior. Starting a simulation activates its session; the user has confirmed human play will not run concurrently.
2. **Headless runner with scripted agents.** Implement persisted run lifecycle, setup shuffle, host transitions, discussion beats, decision barriers, side operations, and recovery. Complete all 15 rounds through the actual APIs, including the circle return stage and final completion transition.
3. **Cave and visibility verification.** Prove that swapped model response delays produce identical game outcomes for the same decisions/draws; cover safe initial exits, missing decisions, multiple departures, collapse/growth, everyone leaving, reveal interruption, retry, and restart. Assert prompt-level and API-level privacy, including host observations and scheduler metadata.
4. **LLM host and players.** Add Chat Completions, role prompts, private histories, schema validation, budgets, and provider-error handling. Run one bounded complete simulation with an operator-supplied key; retain trace evidence and intervention counts.
5. **Conversation console.** Add the basic functional UI, live event stream, controls, privileged observer panels, team views, and export/replay. Keep styling at the current simple shadcn/ui stage.
6. **Balance experiments.** Add repeated headless runs, multiple seeds, rotated tie positions, tunable configurations, and comparisons against scripted baselines. Report position advantage, per-game earnings distributions, final win rates, star advantage, cave exit behavior, cooperation/defection, transfer and reveal spending, usage, and failed/intervened runs.

Meaningful automated checks should include all five games, 2–5 teams with valid rosters, privacy of each game's hidden information, nonleader rejection, retries without duplicate money movement/chat, public/private reveal behavior, and shared-engine parity using the same accepted commands and random draws. Differential privacy fixtures should vary a hidden field and verify it does not appear through prompts, public announcements, response metadata, or shared summaries.

When browser end-to-end testing is requested, follow the repository instruction to divide browser cases among multiple sub-agents and consolidate outcomes in `docs/testcase.md`.

## Interpretation limits and open tuning choices

AI playtests can expose exploits, ambiguous rules, information leaks, and dominant strategies. They are not a reliable estimate of how this particular group of human friends will behave. Use repeated runs, rotated positions, scripted baselines, and uncertainty reporting before changing payouts.

Initial choices proposed here are one agent per team, five teams for a default full run, simultaneous discussion beats, virtual cave time, strict pause-on-infrastructure-failure, and the existing shared game environment with a separate web console service. Beat counts, cave conversation cadence, personalities, and budgets should be configurable. No new game rules or final visual theme are required to start.


## Web configuration and deployment acceptance

The simulation must be operable from its own web app, including configuring and starting a run. The form exposes every field of the shared game configuration and validates with the shared schema:

| Area | Editable parameters |
| --- | --- |
| Global | Initial balance, reveal-pot multiplier |
| Bonus | Bag, threshold, multiplier for each round; star award |
| High or low | Pool and stake multiplier for each round; star award |
| Cave | Starting money and growth per round, logical tick interval, collapse risks for 0–4 departures, star award |
| Circle | Transfer multiplier for each round; no new star award |
| Finale | Minimum, standard maximum, advantage maximum chits; bomb factor per round; no star award |
| Run | Name, seed, team count, model/provider mode, discussion limits, cave discussion cadence, call/token/step budgets |

Provide restore defaults and configuration import/export. Capture immutable configuration at run creation; editing the form affects only future runs. The app includes run history, group conversation, phase/tick progress, private inspectors, run controls, errors, and export/replay from saved events. Provider keys and game service credentials remain server-side. A distinct operator token protects the privileged web console.

Add an `ai-simulation` service to the root Docker Compose file, serving the built web app and API on container port 3010, with configurable host port (default 3010), the existing `game` service as its backend, a health check, and a persistent run-data volume. Pass `SIMULATION_SERVICE_KEY` to both services. Model endpoint, API key and default models are environment variables; operator authentication uses `SIMULATION_OPERATOR_TOKEN`. Do not require Google login automation for synthetic agents: the opt-in bridge authenticates scoped machine identities for real invited session player records, while normal human SuperTokens authentication is unchanged.

## Implementation assignments

The user explicitly requested GPT-6 Luna sub-agents. Three parallel workstreams share agreed API contracts:

1. **Game bridge agent (GPT-6 Luna):** backend session/account creation, scoped authentication, virtual clock/RNG persistence, idempotent control, existing gameplay/private-chat integration, backend tests.
2. **Simulation runner agent (GPT-6 Luna):** server APIs and storage, model adapter and scripted provider, scheduler and host/player roles, privacy filtering, recovery/run controls, tests.
3. **Web interface agent (GPT-6 Luna):** complete tuning form, run configuration, operator login, live conversation and inspectors, history/controls/export, functional shadcn/ui interface.
4. **Parent integration:** workspace/dependencies, Docker Compose and images, environment examples, documentation, contract integration, build/test and browser verification, fixes across boundaries.

Tests should include a scripted complete night through the actual game bridge, all configuration fields flowing into the engine, delayed cave responses, audience filtering, persistence/recovery, and ordinary game regression tests. Real model calls require a configured operator-provided API key; report explicitly if unavailable. Run only against test data during verification, without overwriting existing preview sessions.
