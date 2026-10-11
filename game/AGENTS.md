# Game

Vite + React + TypeScript frontend and Express backend. Use tRPC for shared API types and React Query hooks for requests. Backend serves the built frontend and `/trpc` on port 3000.

Run `pnpm install` at the repository root, then `pnpm --filter game dev`. Build with `pnpm --filter game build`. Docker services are defined in the monorepo root `docker-compose.yml`.

SuperTokens handles Google login. `/admin` requires the `admin` role; Dashboard access is separate. Email test login is admin-controlled, defaults off, and never grants admin access. Keep authorization in backend procedures; PostgreSQL is the source of truth for settings.

For local end-to-end testing only, `LOCAL=true` on the backend and `VITE_LOCAL=true` on the frontend select email/password authentication against the configured SuperTokens Core. The local `admin@test.com` account is granted the app admin role; production must use Google.

Game sessions store invited emails, individual arrival order, gameplay state, and event history in PostgreSQL. Only one session can be active. Non-admin login and API access require membership in the active session; admins are exempt. Team formation comes later.

Keep rules, payouts, star awards, and settings reusable by simulations. Enforce `docs/games.md` visibility and finale star advantage in backend responses as well as UI.

Development phases apply to the whole project, not individual features:
1. Functionality (current): verify behavior with a simple, neat UI using shadcn/ui. Keep logic, state, and API interactions separate from presentation. Do not use the frontend-design skill or establish a final theme yet.
2. UI: use the frontend-design skill and the user's supplied theme to redesign presentation without changing functional code or behavior.
