# AI simulation verification — 14 October 2026

Implementation was divided between three GPT-6 Luna agents (game bridge, runner, web UI), with parent integration and end-to-end verification. Tests used temporary PostgreSQL schemas in the configured test database, ephemeral credentials, and local mock model responses. Existing saved game and UX Preview sessions were not modified by these verification runs.

## Automated checks

- Shared backend build and unit suite: 62 passed, 5 optional PostgreSQL tests skipped in the general suite.
- Simulation bridge PostgreSQL integration: passed separately using a temporary schema. Covered setup replay and concurrent setup deduplication, mismatched request payload rejection, leader capabilities, cross-team/cross-session denial, active-session replacement, ordinary timer exclusion, stale control guards, and action/tick retries without duplicate state or RNG changes.
- Simulation runner build and unit suite: 13 passed. Covered projected prompts, strict Chat Completions function calls, malformed action rejection, cancellation, private-recipient validation, hidden finale advantage, audience filters, tunable bomb limits, replay message deduplication, initial setup retries, and manual-step budget guards.
- Existing game frontend and new simulation frontend production builds passed.
- Frozen pnpm lockfile installation and production deployment packaging passed. The deployed runner resolves the shared backend engine.
- Docker Compose configuration validated. A container image build/run could not be tested because the local Docker daemon is unavailable and the installed Docker app cannot launch.

## Complete nights through the actual APIs

### Scripted agents

A complete 15-round night passed using two teams and non-default values for every game configuration area: global balance/reveal multiplier, bonus bags/thresholds/multipliers/stars, high-low pools/multipliers/stars, cave money/growth/timing/risk/stars, circle multipliers, and finale chit limits/factors. The captured configuration matched the submitted configuration. Final observer standings and exports were present.

Authentication denied unauthenticated operator access and cross-origin requests. Public exports contained only public events; team exports contained only public and that team's events. Credentials were absent from summaries, detail responses, and exports.

### Chat Completions adapter with a local provider stub

A second complete 15-round night passed in OpenAI mode against a local Chat Completions stub, without external API calls. It exercised:

- Host continuation requests capped by the configured discussion limit.
- Concurrent team responses with different response delays.
- Private direct chats through the existing game chat repository and later recipient-only model context.
- Side-operation batches, including contributions that filled a public rank pot.
- Paid public rank observations and acknowledgments before continuing decisions.
- Circle sending and return stages, cave virtual windows, and the final completion transition.
- Rejection of a second concurrent run.
- A fault proxy deliberately dropped the first successful action response after the backend committed it. The runner retried the same command and completed without a duplicate operation.

The run completed all 15 rounds, 84 decision/discussion/operation barriers, 25 side-operation batches, and 34 discussion beats, with no runner failures.

## Browser and recovery checks

The web UI agent verified operator login, editing game parameters, restoring defaults, range validation, configuration export, and the pause → step → resume → stop cycle. Step stayed paused and advanced the run once. Browser testing found and fixed an invalid default token-budget input step, automatic reopening of an old run after “New run,” and the Vite proxy's Host/Origin mismatch.

The parent interrupted a running verification process, restarted the built server, and verified that the run loaded paused with its original configuration and history. Step, resume, and stop remained functional after restart. An older team's inspector used cached permitted observations after a new session became active.

An additional setup recovery fixture simulated backend session creation committing before the runner saved its response. Restart and manual step recovered the same session and team IDs using the original setup request, without duplicate creation events.

The web UI agent then verified the built production UI directly: team views hid observer metrics and displayed distinct permitted histories. The new paste-JSON configuration import accepted a valid initial balance of 321, rejected a cave collapse risk of 101 while retaining the prior configuration, restored defaults, and exported successfully.

## Tool validation correction update — 15 October 2026

Production builds pass for the shared backend, simulation API, and console. The simulation suite now has 24 passing tests, using local mock providers and an isolated temporary run store.

The added checks cover assistant/tool call pairing, successful corrections, malformed JSON, visible action limits, attempt exhaustion, host and discussion-only responses, cancellation, token accounting, and budget interruption. A scheduler test exhausts one team's three attempts while a valid teammate is still responding: all calls settle, no actions are dispatched, the run pauses with the team and reason, and observer diagnostics remain absent from public/team views. A subsequent manual step completes the pending decisions without duplicates. Legacy saved runs load with three tool attempts.

No paid provider requests were made, and no existing simulation data or PostgreSQL fixtures were changed for these checks.

## Full history and context limits — 15 October 2026

The simulation now passes 34 focused tests. Production builds pass for the shared backend, console, and simulation server, and Compose configuration validates with the new host/player context settings.

Tests supply over 70 public messages and 70 private messages across games and verify that the oldest and newest entries, own observations, accepted actions, and legitimately observed rankings survive. Host prompts receive all public history while player prompts exclude other teams' secrets and operator diagnostics. Validation repairs retain only the latest failed tool exchange, and later turns contain no previous validation exchanges.

Mock model catalogues cover compatible-provider context discovery and standard metadata without context fields. Explicit limits, output reservations, preflight overflow, provider-reported prompt/completion usage, provider context-length rejection, and the special context pause all pass. The scheduler test preserves its state and token totals across a context pause and reload, and public/team exports exclude observer usage and context diagnostics. Additional tests distinguish cumulative billed usage from current request context and reconstruct the available metrics in older saved runs.

Preflight sizing is an estimate for arbitrary compatible tokenizers; actual provider counts and context-limit errors are also checked. Verification used only local mock model/game APIs and temporary stores. No paid requests were made and no existing run was resumed.

## Model transport diagnostics — 15 October 2026

All 36 focused tests and the simulation production build pass. A deliberately dropped mock connection preserves `UND_ERR_SOCKET`, provider host, model, attempt, and request stage as observer-only `MODEL_REQUEST_FAILED` diagnostics. Transport failures do not use validation correction attempts; operator cancellation does not create a transport error. The runner test confirms a network failure pauses without dispatching batch actions, persists its diagnostics, and allows a later successful step. Console polling retains newer run revisions to prevent older responses overwriting status. No real model calls were made or saved user runs resumed.

## Cumulative token budget removed — 15 October 2026

All 37 focused tests pass. Cumulative tokens remain recorded for the run and each model, but no longer pause the scheduler, correction loop, host, or decision/discussion barriers. New configurations omit the old limit, incoming legacy configurations ignore it, and persisted runs discard it on load. A regression run starts with 2,606,867 tokens used and a legacy limit of one token, then verifies validation recovery and continued game actions while preserving context-limit pauses. Step and wall-time limits remain. The live API confirms the paused Second run no longer has a token budget; it was not resumed during verification.

## Cave turn clarity — 15 October 2026

The saved Second run had 35 accepted cave decisions and 25 validation failures caused by game decisions attempted in financial-only turns. Explicit financial/discussion/decision turn identifiers and instructions now distinguish the scheduler phases, and observer request/rejection events identify their turn. The observer conversation displays existing private cave decision receipts with team names; this presentation change does not modify model histories or audience permissions.

A mocked cave scheduler regression verifies both teams can pass the optional financial turn and then leave successfully on the subsequent game-decision turn, with no validation failures and no action dispatched during the financial turn. Public views exclude all votes and each team sees only its own vote. The suite passes 38 tests; existing real runs were not resumed during verification.

## Bomb allocations and model output maxima — 15 October 2026

The saved run exposed a rule-card error: it described up and down as separate piles, while both the shared engine and simulation validator correctly bound their combined total. Rule cards now explicitly describe the direction and recipient piles, per-player bounds, zero direction counts, independent totals, and examples. Prompt schemas use current numeric bounds; feedback reports both invalid pile totals. A resumed legacy bomb session receives one public correction per round without rewriting history.

Responses previously missing tool calls frequently consumed exactly 1,200 output tokens. Exhausted output now generates a separate observer-only pause with finish reason and usage. The arbitrary fixed output cap is removed: each request uses its model's published output maximum even with manually configured context. Providers lacking output metadata require the documented maximum via host/player environment settings; no arbitrary fallback is used. A read-only live metadata request confirmed 128,000 maximum output tokens for the configured model; no paid completions were made and the user run was not resumed.

Mocked tests cover standard/advantaged allocation schemas and examples, zero directions, differing legal totals, both invalid totals corrected on retry, full distinct host/player output maxima, missing output metadata, usage preservation, and an existing bomb session receiving a deduplicated rule correction before an output-limit pause.

All 43 focused tests and the complete simulation production build pass. The actual resolver was also exercised against live provider metadata and resolved a 1,050,000-token context window and 128,000-token output maximum for both configured roles, ignoring the obsolete 1,200-token environment setting.

## Original implementation verification limits

- No real OpenAI request was made because no operator API key was configured. Provider protocol and scheduling were tested with local responses; model strategy and real provider behavior still need a keyed run.
- The container image was not executed. Compose and equivalent local production packaging were verified.
- Paste-JSON import was verified; the native file picker and narrow-viewport visual checks were unavailable through the browser controls. Responsive breakpoints were reviewed in source.
- Broader statistical balance experiments and human behavior validation are separate from infrastructure correctness.


## Discussion cadence and early closure — 15 October 2026

The latest saved run retained minimum 1 / maximum 4 normal sweeps and 0 cave sweeps. It had no scheduled cave discussion beats, but the runner still emitted cave discussion open/close notices, and financial/game decision turns published public chat. Normal limits were also applied to separate post-round and next pre-round discussions. An earlier first-round review requested confirmation of a transfer promise its proposer had already made.

Zero sweep counts now bypass discussion entirely, including notices and host reviews. Public/private chat is restricted by the action-turn tool schema, validation, and barrier delivery to scheduled discussion turns. The normal cadence now uses one shared discussion between rounds with previous private feedback and upcoming rules, with financial settlement before play. The initial discussion and final debrief remain. Already-started legacy discussions finish safely; a completed legacy post-round discussion is not repeated before the next round.

The host receives the current sweep's public replies explicitly and is instructed to close agreed terms once the minimum is met, count conditional offers as commitments, and avoid redundant reconfirmation, impossible proof demands, or optional future planning. Consensus is judged by the host model; numerical minimums and caps are enforced by the runner.

All 54 simulation tests pass, and the server and console production builds pass. Added mocked scheduler cases cover zero cave sweeps, initial one-sweep closure with maximum 4, a single discussion between two rounds, private feedback and upcoming-rule availability, financial actions while ready, minimum enforcement, maximum enforcement, exact positive cave counts, legacy boundary recovery, finale settlement, and zero normal limits. Provider checks reject both public and private action-turn chatter through the correction loop. These checks used only local mock model/game APIs and temporary stores; no paid model requests were made or existing runs resumed.


## Financial actions during discussion — 15 October 2026

Discussion turns now expose money.transfer and pot.contribute alongside public/private messages, subject to the authenticated player view and balance. Main game choices stay excluded from discussion and are available only in game-decision turns after the host starts the round. Shared action schemas, validation, per-turn instructions, the host briefing, rule cards, and console help describe the same permissions.

Each discussion speaker's optional financial action is persisted with a stable request ID and dispatched before the next speaker. The runner refreshes private views before each unfinished speaker, allowing transfer recipients to observe their new balance and receipts immediately. Rank reveals are observed and acknowledged before continuing the saved order. Public rank snapshots also enter public history before acknowledgments hide them; private rank snapshots remain scoped to the purchaser. A rejected stale financial action is recollected with fresh state while retaining already delivered chat, and an accepted payment is skipped on resume.

All 61 simulation tests pass, and the simulation server and console production builds pass. New mocked checks cover payments during discussion, fresh recipient receipts, public/self pot completion, rank visibility, interrupted-sweep recovery, stale-payment recollection without duplicate messages, financial tools during cave discussion, and all four discussion phases accepting messages plus financial actions while omitting game choices. Existing minimum/maximum discussion, zero-cave-discussion, game-action gating, privacy, and finale-settlement checks pass. Verification used local mocked APIs and temporary stores; existing saved runs were not resumed and no paid model calls were made.


## Host speaking-order swaps — 15 October 2026

Every new discussion sweep first saves its seeded random speaking order. The host receives that numbered roster and public history through a dedicated submit_discussion_swaps tool. It can retain the shuffle with an empty list or exchange two current one-based positions per swap, up to N - 1 swaps. It may prioritize a team others are publicly waiting on to reduce another sweep, while providing no player action recommendations. The scheduling tool has no message, action, or replacement-order field; assistant prose is never published from this call. Regular host commentary also explicitly forbids recommending player actions.

Strict schemas reject unknown fields, noninteger or out-of-range positions, self-swaps, and excessive lists. The server validates the saved roster and applies swaps locally, preserving each current team exactly once. Original orders, validated swaps, and effective orders are durable observer events. Saved reviews are reused after restart before player invocation, partial legacy sweeps keep their original order and completed speakers, and failed host requests retry the same saved random proposal. Invalid swaps use bounded correction attempts and pause before any player call when exhausted. Scripted runs retain random order without a model request. Disabled discussion phases make no ordering call. New AI sweeps add one host completion, included in existing usage and runtime checks.

The observer console now displays the effective order and expandable swap audit; internal scheduling events remain absent from public/team histories. All 72 simulation tests pass, and both simulation server and console production builds pass. Added checks cover all reachable permutations for two through five teams, chained swap semantics and immutable initial orders, malformed rosters and swaps, strict tool pairing/correction, public-only host input, rejected advice/action/replacement-order outputs, moving an awaited team first, stable proposals across failure, saved reviews before sweep start, legacy partial sweeps, and scripted behavior. Existing discussion finance, reveal privacy, minimum/maximum cadence, recovery, and game-action checks pass. These checks used mocked APIs and temporary stores; saved user runs were not resumed and no paid model calls were made.
