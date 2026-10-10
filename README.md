# Game Theory Night 2

A monorepo for a game theory night inspired by Tom Scott's **Money**: five planned games, three rounds per game, and increasing stakes.

- `presentation/` — future HTML presentation.
- `game/` — Vite, React, and TypeScript player app.
- `ai-simulation/` — future multi-agent chat interface for playtesting and balancing.

See [docs/games.md](docs/games.md) for draft game concepts and unresolved rules. The presentation and simulation folders are currently empty.

## Run the game app

Use Node.js 22.12+ (or a supported newer LTS release), then:

```sh
pnpm install
pnpm --filter game dev
```

Run `pnpm --filter game build` to type-check and build, `pnpm --filter game lint` to lint, and `pnpm --filter game preview` to preview a production build.

The app currently contains the Vite starter screen; login and gameplay are not implemented yet.
