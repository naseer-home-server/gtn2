# Game

Vite + React + TypeScript frontend and Express backend. Use tRPC for shared API types and React Query hooks for requests. Backend serves the built frontend and `/trpc` on port 3000.

Run `pnpm install`, `pnpm setup:local`, then `pnpm dev` at the repository root. Each worktree gets its own persistent Docker PostgreSQL database and available ports; SuperTokens uses the shared `./scripts/pf-anton` forward. After setup, `pnpm --filter game dev` also uses the generated environment files. Use `pnpm db:seed` to create missing local fixtures or `pnpm db:seed --reset` to restore only those fixtures. Build with `pnpm --filter game build`. Docker services are defined in the monorepo root `docker-compose.yml`.

SuperTokens handles Google login. `/admin` requires the `admin` role; Dashboard access is separate. Email test login is admin-controlled, defaults off, and never grants admin access. Keep authorization in backend procedures; PostgreSQL is the source of truth for settings.

For local end-to-end testing only, `LOCAL=true` on the backend and `VITE_LOCAL=true` on the frontend select email/password authentication against the configured SuperTokens Core. The local `admin@test.com` account is granted the app admin role; production must use Google.

For manual gameplay/UI previews, sign in as `admin@test.com` with the locally configured test password and open **Sessions** in the admin page. The local seed script creates one 10-player **E2E Playthrough** at Bonus round 1 and five three-player sessions with the **UX Preview** prefix as game checkpoints. Preview checkpoints include useful funds and, for later games, engine-generated prior outcomes/stars. See [local development and player accounts](../docs/local-development.md). Set the session for the game being previewed active, start its prepared round, then use its listed player emails to sign in as invited players in separate browser profiles/tabs and inspect the player view. These sessions are already prepared for their respective games; if setting up another session manually, mark invitees as arrived, assign them to teams, and select the desired game in **Start at game**. This prepares round 1; use **Start <game> · round 1** to launch it. After each round, the admin must use the button naming the next game and round to start play. Admin credentials should stay in local environment/configuration and must not be committed to this repository.

Game sessions store invitations, arrival order, admin-assigned teams, configuration, gameplay state, and all actions/outcomes in PostgreSQL. Only one session can be active. Non-admin login and API access require membership in it; admins are exempt. Freeze team tie order when play starts.

Keep the pure engine in `backend/src/engine` independent of UI, auth, and storage; inject time/randomness. Engine money is integer-cent strings; player API money is decimal strings. Enforce `docs/games.md` visibility on the server. See `docs/game-api.md` for state/action APIs and retry semantics. Admins see the full audit; players get filtered views only.

Development phases apply to the whole project, not individual features:
1. Functionality: retain verified behavior and keep logic, state, and API interactions separate from presentation.
2. UI (current): use the frontend-design skill and the user's supplied invitation theme and logo to redesign the game frontend. Prioritize phone use for players. Preserve game rules, API behavior, authentication, permissions, money handling, and retries while refactoring presentation and frontend organization. The UI refactor plan is in `design/ui-refactor-plan.md`; `ai-simulation` is outside its scope.
