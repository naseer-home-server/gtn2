# Game Theory Night 2

A monorepo for a game theory night inspired by Tom Scott's **Money**: five planned games, three rounds per game, and increasing stakes.

- `presentation/` — future HTML presentation.
- `game/` — Vite, React, and TypeScript player app.
- `ai-simulation/` — future multi-agent chat interface for playtesting and balancing.

See [docs/games.md](docs/games.md) for draft game concepts and unresolved rules. The presentation and simulation folders are currently empty.

## Run the game app

Use the pinned Node version and pnpm, then:

```sh
nvm use
pnpm install
pnpm --filter game dev
```

The frontend runs on Vite and proxies `/api` to the Express backend on port 3000. The backend returns `Hello world` from `/api/hello` and serves the production frontend from the same port.

Run `pnpm --filter game build` to build both parts. The root `docker-compose.yml` is the monorepo service manifest. Run `pnpm docker:dev` to build and start services in the foreground, or `pnpm docker:prod` to build and start them in the background. The game service is available on port 3000 and uses `/health` for container health checks.
