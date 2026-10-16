# AI simulation web app

A host and two to five team agents discuss strategy in a public room and play the existing five-game night through the game backend. The console lets you edit every shared game tuning field, configure agents and budgets, start runs, inspect the conversation and permitted player state, and export saved events.

Player agents act as human teams taking home their final balance after all rounds and transfers. Their primary objective is to maximize that payout. Teams are ranked by their final balances. Players are also told that eligibility for any prize requires final earnings above the average from prior human playthroughs; that threshold remains unknown until the series ends. The host must not disclose or guess its value early.

There is one discussion between rounds, while the upcoming round waits ready: teams review their previous private results and negotiate with the upcoming rules available. The first round has an initial discussion. Discussion permits money transfers and reveal-pot contributions alongside public/private messages. Financial actions execute before the next speaker, who receives a fresh private view. Game choices are unavailable during discussion and become available in their separate decision turns only after the host starts the round. Optional financial windows also follow each sweep for settlement. The final round also gets post-round discussion and settlement before final balances are recorded. Financial windows permit transfers and reveal-pot contributions, with `actionJson: null` to pass. Game choices have separate turns. The cave clock stays frozen until decisions have been collected. Observer activity combines conversation with private audit events; other teams and the host retain only their permitted information.

The host opens with a game-theory briefing about cooperation, defection, rising stakes, reputation, retaliation, paid rank information, and explicit transfers to share proceeds. Cooperation and punishment are strategic possibilities under each game’s rules, not guaranteed outcomes. A promise is not an executed payment.

## Local development

Use Node 22.23.1 and pnpm. Configure this checkout with `pnpm setup:local` as described in [local development](../docs/local-development.md). This gives the game backend its own port and database for this worktree.

1. Copy `ai-simulation/.env.example` to `ai-simulation/.env`.
2. Set `SIMULATION_SERVICE_KEY` to a random secret of at least 32 characters in both `ai-simulation/.env` and `game/backend/.env`. Use the same value in both files and restart the game backend after changing it.
3. Set a separate `SIMULATION_OPERATOR_TOKEN` in `ai-simulation/.env`. Use it to sign into the privileged console.
4. For AI agents, set `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `SIM_HOST_MODEL`, and `SIM_PLAYER_MODEL`. Select models supporting Chat Completions function calling. Scripted mode works without a model key.
5. Run `pnpm local:info` and set `GAME_API_BASE_URL` in `ai-simulation/.env` to `http://127.0.0.1:<backend port>` from its output. The default `3000` may belong to another checkout.
6. From the repository root, run `pnpm install`. Start `pnpm dev` in one terminal for the game, then `pnpm simulation:dev` in another for the simulation API and web app.
7. Open [the simulation console](http://localhost:5185), sign in with `SIMULATION_OPERATOR_TOKEN`, configure a run, and start it.

The UI dev server runs on port 5185 and proxies its API to the simulation server on port 3010. The simulation server calls the game backend at `GAME_API_BASE_URL`. Run configuration and event records live in `ai-simulation/data/` by default and are excluded from Git. Keep that directory private: it contains the runner's scoped player capabilities.

Generate each secret separately, for example with `openssl rand -hex 32`. Never put the provider key or simulation service key in frontend environment variables. The operator token grants access to all simulation observations, including private audit views.

## Docker Compose

Set the root `.env` using `.env.example`, including the existing game/database settings, `SIMULATION_SERVICE_KEY`, and `SIMULATION_OPERATOR_TOKEN`. Add provider settings if using AI mode. Then:

```sh
docker compose up --build -d
```

Open [the simulation console](http://localhost:3010). `SIMULATION_PORT` changes the host port. The console is published on loopback by default. If deploying behind a reverse proxy, use TLS and forward the original host consistently for the same-origin checks.

The `ai-simulation` service connects to `http://game:3000`, waits for the game's health check, and stores run data in the `simulation-data` named volume. Both services use the same service key. The existing PostgreSQL database stores authoritative gameplay, virtual clock/RNG state, invitations, and private chats. No second game service or database is required.

Only one game session is active. Starting a simulation activates its generated session; do not run human play concurrently. Existing saved sessions are retained and can be reactivated in the game admin app later.

## Tuning and interpretation

The form covers global settings, all per-round money and multipliers, cave risk and timing, the first three games' star awards, circle multipliers, and finale chit limits/factors. Circle and finale do not gain an editable star award. Restore defaults or import/export configurations, including importing by pasting JSON; each run captures its own immutable configuration.

Discussion uses ordered sweeps. At the start of each sweep, the runner saves a newly shuffled, seeded speaking order. Before any player speaks, the host sees the numbered order and public history and may keep it or submit swaps of two positions. It may prioritize a team others are publicly waiting on, while providing no gameplay advice. Swaps apply sequentially and preserve every team exactly once; invalid positions, self-swaps, replacement rosters, and extra fields are rejected. It requests one team’s completion, publishes that reply, delivers any private message, and executes any submitted transfer or reveal contribution before calling the next team with a fresh player view and updated permitted history. Reveal snapshots are privately observed and acknowledged before the saved speaking order continues; a public reveal pauses play until all teams acknowledge. Pause/resume retains the random proposal, validated host swaps, and saved effective order, and skips already delivered turns. A saved host review is reused without another ordering call; an already-started legacy sweep keeps its existing order. Scripted runs keep the random order without model calls. The minimum/maximum sweep settings apply once to each discussion between rounds, as well as the initial discussion and final debrief. Cave discussion uses its own exact sweeps-per-window setting; zero skips cave-window discussion and its notices, while the normal discussion before a cave round still follows the normal limits. Public and private chat are restricted to scheduled discussion turns, so financial/game action turns cannot create extra discussion. The host reviews each sweep using its public replies and closes an agreed plan as soon as the minimum is met. Conditional promises count as commitments; redundant confirmation, hidden-proof demands, and optional future planning must not extend a settled plan. The cap is enforced even if the host asks to continue. Setting both normal limits to zero skips normal discussion, including open/close notices.

The observer audit displays the effective speaking order and expandable original order/swaps. Scheduling reviews use a dedicated `submit_discussion_swaps` tool, with one-based `firstPosition` / `secondPosition` pairs and an empty `swaps` list to retain the shuffle. At most team count minus one swaps are accepted, enough to reach any permutation. This adds one host completion per new AI discussion sweep; usage, context checks, retries, and wall-time limits apply normally. The scheduling call receives no private observations, cannot emit public commentary, and cannot execute player actions.

All teams receive their own payout, balance, stars, and permitted receipts before the next between-round discussion. A financial batch follows each sweep, with a final settlement window before the upcoming round starts, so teams can act on payment promises. The finale retains a closing discussion and settlement before final balances are recorded. The host and other teams do not see this private feedback. Game choices and standalone financial batches still use a shared history cutoff and are collected independently before execution. Discussion financial actions execute sequentially with their speaker, so later speakers can see receipts that belong to them; unrelated transfers remain private. The cave advances logical time only after the decision window is processed, so provider latency does not affect outcomes. Simulation timing models strategy rather than human reflexes.

Existing paused/running sessions retain any already-started discussion. A completed legacy post-round discussion counts for that boundary, avoiding a duplicate new pre-round discussion. Subsequent boundaries use one shared discussion. A round already started cannot be rewound into pre-round discussion; subsequent rounds use the new ready/start sequence. Previously proposed action batches retain their original request IDs and are recovered before new turns are scheduled.

In OpenAI mode, **Tool call attempts** sets the total model attempts per turn, from 1 to 10 (default 3: the initial proposal plus two corrections). Malformed tool arguments, unavailable actions, and choices outside the player's visible limits return a private structured validation error to that same model. Each correction retains the original prompt and only the latest failed assistant/tool exchange, replacing earlier failed exchanges. Hosts use the same limit for their submissions. These attempts are separate from discussion beats.

Every completion, including rejected proposals, contributes to token usage tracking. There is no cumulative token budget; per-model context guards still pause when a request approaches the model's context window. Step and active wall-time limits remain in effect. Older saved runs automatically discard their former total token limit when loaded. Invalid proposals have no game effects. If a model exhausts its attempts, the run pauses before that action batch’s decisions are dispatched. In ordered discussion, earlier speakers’ replies remain delivered and resume retries the unfinished speaker. Observer audit events show the team/host, attempted action, validation reason, and attempt number; those diagnostics are excluded from public/team views and exports. Resume starts a fresh attempt sequence for the unfinished turn. Previously saved runs without the new setting receive the default of 3 when loaded.

Models receive their complete permitted game history across all games and rounds. Players get public conversation, private messages they sent/received, their own accepted actions, paid rank observations, and their past filtered state observations. The host gets the full public history, including public game phases, star totals, public reveal-pot progress, paid public rank snapshots, and revealed bomb recipients. Other teams' private information and operator diagnostics are excluded. Historical observations remain historical: earlier balances and ranks need not match the current state. The runner does not truncate older messages or summarize away game events. Validation exchanges never become later turns' game memory; the operator audit still retains them.

**Host context tokens** and **Player context tokens** configure each model's request context window. Set 0 to discover the window from the configured provider's `GET /models` metadata when it publishes `context_length` or `context_window` (including OpenRouter). Standard OpenAI model metadata does not publish a context window; set the model's documented value explicitly when using such an endpoint. Server defaults can be supplied as `SIM_HOST_CONTEXT_TOKENS` and `SIM_PLAYER_CONTEXT_TOKENS`; explicit positive run values take precedence. If automatic lookup cannot resolve a window, the runner pauses with `MODEL_CONTEXT_LIMIT_UNKNOWN` before making a completion request.

Output allowance uses each model's full published maximum, including OpenRouter's `top_provider.max_completion_tokens`. This discovery also runs when the context window was set manually. The old fixed `SIM_MAX_OUTPUT_TOKENS` setting is ignored. For providers that do not publish output limits, configure the documented host/player maxima through `SIM_HOST_MAX_OUTPUT_TOKENS` and `SIM_PLAYER_MAX_OUTPUT_TOKENS`; leave these at 0 for automatic discovery. Missing output metadata without a configured documented maximum pauses with `MODEL_OUTPUT_LIMIT_UNKNOWN`, rather than guessing. Context checks reserve the full resolved output maximum. If a response still exhausts its allowance before returning a complete turn, `MODEL_OUTPUT_LIMIT` pauses immediately and records finish reason and available usage, instead of wasting validation attempts.

Bomb allocations use two piles: the combined up/down direction pile and the recipient pile. Each pile has its own total limit; zero for either direction is legal and the two pile totals need not match. Prompts and action schemas include the current team's bounds and a valid example. Validation feedback shows both submitted totals when both are invalid. Existing runs with the old misleading bomb card receive an explicit public rule correction on resume; their original history is retained.

The observer's **Host and player token usage** table records cumulative input/output/total tokens for each agent and model, along with the latest request's input count, reserved output allowance, and resolved context window. Cumulative token usage measures repeated requests and is independent of the per-request context window. Historical runs reconstruct totals from their recorded usage events; missing historical input/output counts display as unavailable or partial.

Before each attempt the runner sizes the full prompt and tool definitions using a conservative byte-based estimate, calibrated upwards by provider-reported prompt counts, with output space and a safety margin reserved. This is an estimate for arbitrary compatible models, not an exact tokenizer. Provider-reported input counts are checked after each response, and provider context-length errors are recognized separately. Near/exceeded context pauses the run with `MODEL_CONTEXT_LIMIT` and records the affected agent, model, counts, window and source in the observer audit. It never trims game history to continue. Provider timeouts and other API errors retain their normal error handling. Restart the runner and refresh the console after changing server defaults; then resume the paused run when ready.

The observer can inspect privileged results; public/team views filter private events on the server. Player prompts use authenticated filtered game views. Agents may retain knowledge of ranks legitimately revealed earlier, but those snapshots are historical.

Use scripted runs to verify infrastructure without API costs. AI runs depend on an operator-provided key and supported models. Repeat experiments with different seeds and tie positions before drawing balance conclusions; model behavior does not directly predict human behavior.

## Build and verify

```sh
pnpm simulation:build
pnpm simulation:test
pnpm --filter backend test
```

The detailed architecture and implementation assignments are in [the plan](../docs/ai-simulation-plan.md).
Verification results and remaining environment checks are in [the test report](../docs/ai-simulation-verification.md).
