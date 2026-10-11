# Game

Vite + React + TypeScript frontend and Express backend. Use tRPC for shared API types and React Query hooks for requests. Backend serves the built frontend and `/trpc` on port 3000.

Run `pnpm install` at the repository root, then `pnpm --filter game dev`. Build with `pnpm --filter game build`. Docker services are defined in the monorepo root `docker-compose.yml`.

SuperTokens handles Google login. `/admin` requires the `admin` role; Dashboard access is separate. Email test login is admin-controlled, defaults off, and never grants admin access. Keep authorization in backend procedures; PostgreSQL is the source of truth for settings.

Keep rules, payouts, star awards, and settings reusable by simulations. Enforce `docs/games.md` visibility and finale star advantage in backend responses as well as UI.

Development phases apply to the whole project, not individual features:
1. Functionality (current): verify behavior with a simple, neat UI using shadcn/ui. Keep logic, state, and API interactions separate from presentation. Do not use the frontend-design skill or establish a final theme yet.
2. UI: use the frontend-design skill and the user's supplied theme to redesign presentation without changing functional code or behavior.
