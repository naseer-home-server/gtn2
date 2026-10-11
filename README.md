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

Before starting, copy `game/backend/.env.example` to `game/backend/.env` and fill in the SuperTokens Core connection and Google OAuth credentials. `APP_URL` is the browser's origin: `http://localhost:5173` for Vite development, or the public deployment URL in production.

The frontend proxies `/auth` and `/trpc` to the backend on port 3000. tRPC shares API types through the `backend` workspace package; React Query hooks own requests and state. After login, the home page displays the backend's `Hello world` message.

## Authentication

Register `<APP_URL>/login/callback/google` as an authorized redirect URI in Google OAuth. Google login is available in development and production.

Set `SUPERTOKENS_DASHBOARD_ADMINS` to the comma-separated emails allowed into `<APP_URL>/auth/dashboard`. Log in to the game with Google, then open that user in the Dashboard and assign the `admin` role in the `public` tenant. Dashboard access and the game's `admin` role are separate. See [SuperTokens role assignment](https://supertokens.com/docs/post-authentication/dashboard/users-listing-and-details).

The `/admin` page can enable or disable email test login. When enabled, `/login` accepts any valid email without a password, OTP, or email delivery. Test identities remain separate from Google identities and cannot access admin features. Disabling the setting also blocks existing test sessions from protected game APIs.

The setting starts disabled and persists in `DATA_DIR/settings.json`; Docker stores it in the `game-data` volume. Run `pnpm --filter backend test` to check authorization, validation, and persistence.

Run `pnpm --filter game build` to build both parts. The root `docker-compose.yml` is the monorepo service manifest; use `.env.example` for its environment variables. Run `pnpm docker:dev` to build and start services in the foreground, or `pnpm docker:prod` to build and start them in the background. The game service listens on container port 3000 and uses `/health` for container health checks.
