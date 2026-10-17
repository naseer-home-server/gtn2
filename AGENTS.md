# Game Theory Night 2

A night for friends inspired by Tom Scott’s **Money**: five games, three rounds each, increasing stakes. Play as teams of two (one solo team if needed), up to seven teams. Each team is one “player,” with a balance carried across rounds/games; ties use a fixed order based on each team's first member to arrive.

- `game/`: Vite + React + TypeScript app for player login, gameplay, and the admin presentation.
- `ai-simulation/`: local web console for multi-agent playtesting and balance; run it with `pnpm simulation:dev` alongside the game app.

Use pnpm. Presentation lives in the game frontend: `/admin/presentation` previews the deck and opens `/admin/presentation/present` in a separate TV tab. Keep presentation wording minimal; prefer visuals over text when explaining ideas. Keep slides separate from private host controls; any future live slide data must be filtered to public information on the server. Leave the unused root `presentation/` folder empty. The AI simulation runs locally and is not part of the deployed Docker Compose services. Read [rules, tuning, and visibility](docs/games.md) before gameplay work. Potential winnings increase across rounds and games. Treat values and star awards as drafts; star counts are tunable for every game except the circle game and finale. Gamble bomb is the finale; most stars grant a significant advantage revealed only then. Share rules/configuration between live play and simulations. Ranks are hidden until a team pays for a private self-rank reveal or all teams pay toward a public reveal. A private reveal shows only that team's rank; a public reveal shows every team's rank to everyone. Ranks hide after acknowledgment, and balances/earnings stay private.

When asked to run an end-to-end test, spawn multiple sub-agents and divide the browser cases in [docs/testcase.md](docs/testcase.md) among them. Have each report the cases attempted, outcomes, and any failures; consolidate the results in the testcase document.

`pnpm setup:local` creates one 10-player **E2E Playthrough** and five minimal preview sessions with names prefixed **UX Preview**. They are checkpoints for previewing each game's player view: set the matching session active, start its prepared round in the admin view, then sign in with one of its invited player accounts to open that game's player view. See [game preview instructions](game/AGENTS.md).

## Run locally

From the repository root, start `./scripts/pf-anton` once for the shared SuperTokens Core and leave it running. Local PostgreSQL comes from Docker Compose, with a persistent named volume and explicit unique project name for each checkout/worktree. Use:

```sh
nvm use
pnpm install
pnpm setup:local
pnpm dev
```

Run `pnpm setup:local` first in every new worktree. It generates ignored environment files and available app/database ports, starts PostgreSQL, applies migrations, and creates the six local test fixtures. Regular `pnpm db:seed` preserves fixture progress; `pnpm db:seed --reset` resets only seed-owned fixtures. Use `pnpm db:up`, `pnpm db:down`, and `pnpm test:db` so commands target this checkout's database. See [local development](docs/local-development.md). Never use the forwarded PostgreSQL database for local regression tests.

Project-wide phases: functionality first with a simple, neat shadcn/ui interface; final UI later using the frontend-design skill and a user-provided theme. Keep functional code separate from presentation.
