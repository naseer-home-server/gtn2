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

## Limits of this verification

- No real OpenAI request was made because no operator API key was configured. Provider protocol and scheduling were tested with local responses; model strategy and real provider behavior still need a keyed run.
- The container image was not executed. Compose and equivalent local production packaging were verified.
- Paste-JSON import was verified; the native file picker and narrow-viewport visual checks were unavailable through the browser controls. Responsive breakpoints were reviewed in source.
- Broader statistical balance experiments and human behavior validation are separate from infrastructure correctness.
