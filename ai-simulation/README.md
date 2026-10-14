# AI simulation web app

A host and two to five team agents discuss strategy in a public room and play the existing five-game night through the game backend. The console lets you edit every shared game tuning field, configure agents and budgets, start runs, inspect the conversation and permitted player state, and export saved events.

## Local development

Use Node 22.23.1 and pnpm. Keep `./scripts/pf-anton` and `pnpm --filter game dev` running as described in the root README.

1. Copy `ai-simulation/.env.example` to `ai-simulation/.env`.
2. Set `SIMULATION_SERVICE_KEY` to a random secret of at least 32 characters in both `ai-simulation/.env` and `game/backend/.env`. Restart the game backend after changing it.
3. Set a separate `SIMULATION_OPERATOR_TOKEN` in `ai-simulation/.env`. Use it to sign into the privileged console.
4. For AI agents, set `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `SIM_HOST_MODEL`, and `SIM_PLAYER_MODEL`. Select models supporting Chat Completions function calling. Scripted mode works without a model key.
5. From the root, run `pnpm install`, then `pnpm simulation:dev`.
6. Open [the simulation console](http://localhost:5185), sign in, configure a run, and start it.

The UI dev server runs on port 5185 and proxies its API to the simulation server on port 3010. The simulation server calls the normal game server on port 3000. Run configuration and event records live in `ai-simulation/data/` by default and are excluded from Git. Keep that directory private: it contains the runner's scoped player capabilities.

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

Public discussion is collected in simultaneous beats. Agents see the same public history cutoff plus their own permitted observations. Game decisions are collected before execution. The cave advances logical time only after the decision window is processed, so provider latency does not affect outcomes. Simulation timing tests strategy rather than human reflexes.

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
