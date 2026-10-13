# Game Theory Night 2

A monorepo for a game theory night inspired by Tom Scott's **Money**: five planned games, three rounds per game, and increasing stakes.

- `presentation/` — future HTML presentation.
- `game/` — Vite, React, and TypeScript player app.
- `ai-simulation/` — future multi-agent chat interface for playtesting and balancing.

See [docs/games.md](docs/games.md) for draft game concepts and unresolved rules. The presentation and simulation folders are currently empty.

## Run the game app

Leave `./scripts/pf-anton` running in another terminal for the configured database and SuperTokens Core. Use the pinned Node version and pnpm, then:

```sh
nvm use
pnpm install
pnpm --filter game dev
```

Before starting, copy `game/backend/.env.example` to `game/backend/.env` and fill in the SuperTokens Core connection, Google OAuth credentials, and PostgreSQL `DATABASE_URL`. `APP_URL` is the browser's origin: `http://localhost:5173` for Vite development, or the public deployment URL in production. The backend applies checked-in Drizzle migrations during startup; create new migrations with `pnpm --filter backend db:generate`.

The frontend proxies `/auth`, `/trpc`, and `/api` to the backend on port 3000. tRPC shares API types through the `backend` workspace package; React Query hooks own requests and state. The functionality-phase UI uses shadcn/ui with Tailwind CSS; add components with `pnpm --filter frontend exec shadcn add <component>`.

## Authentication

Register `<APP_URL>/login/callback/google` as an authorized redirect URI in Google OAuth. Google login is available in development and production.

Set `SUPERTOKENS_DASHBOARD_ADMINS` to the comma-separated emails allowed into `<APP_URL>/auth/dashboard`. Attempt Google login, then open that user in the Dashboard and assign the `admin` role in the `public` tenant. The first attempt creates the identity even if session membership blocks login; sign in again after assigning the role. Dashboard access and the game's `admin` role are separate. See [SuperTokens role assignment](https://supertokens.com/docs/post-authentication/dashboard/users-listing-and-details).

The `/admin` page can enable or disable email test login. When enabled, invited players in the active session can log in with their email without a password, OTP, or email delivery. Test identities remain separate from Google identities and cannot access admin features. Disabling the setting also blocks existing test sessions from protected game APIs.

For local end-to-end testing, set `LOCAL=true` in `game/backend/.env` and `VITE_LOCAL=true` in `game/frontend/.env`. The local app then uses the same SuperTokens Core's email/password account, `admin@test.com` / `abcd1234`; that account receives the app's `admin` role in local mode. Local email/password auth is rejected when the backend runs with `NODE_ENV=production`. Clear these flags to use Google login locally.

The `app_settings` table is the source of truth for admin settings. Email test login defaults to disabled on first startup and is read from PostgreSQL for each authorization check.

## Game sessions

On `/admin`, create a named session with up to ten individual attendee emails, then set it active. Only one session can be active; activating another replaces it. Non-admin Google and test logins require an invited email in the active session. Protected API requests check membership again, so switching sessions also removes access for former participants. Admins can sign in without an invitation.

Open a session's **Arrival order** page to mark attendees as they arrive and correct their order. Assign arrived attendees to two to five teams, edit the draft configuration, and start the playthrough. Team arrival order then freezes. Admins see every command, outcome, balance, and private choice, and advance completed rounds. Players use the home page for their team's actions and private results. Cave ticks run automatically; other games resolve when all teams submit.

For quick player-view previews, the admin **Sessions** page has five preconfigured **UX Preview** sessions, one checkpoint for each game. Set the matching session active, then sign in with one of its invited player accounts to view that game's player experience.

All five games, public stars, the finale advantage, and repeatable paid ranking reveals run in a pure backend engine. A private reveal shows only the team's own rank; a public reveal shows every team's rank to everyone. PostgreSQL persists each action and outcome atomically with session state. [The state/action API](docs/game-api.md) supports future AI players directly, with the same authentication and visibility rules as the UI. The `ai-simulation/` folder remains empty.

Run `pnpm --filter backend test` for engine, visibility, authentication, and API tests, including a deterministic 15-round playthrough. With PostgreSQL configured, `RUN_DB_TESTS=1 pnpm --filter backend test` also tests real persistence and a full playthrough inside transactions that roll back their fixtures.

Run `pnpm --filter game build` to build both parts. The root `docker-compose.yml` is the monorepo service manifest; use `.env.example` for its environment variables. Run `pnpm docker:dev` to build and start services in the foreground, or `pnpm docker:prod` to build and start them in the background. The game service listens on container port 3000 and uses `/health` for container health checks.
