# Game

Vite + React + TypeScript frontend and Express backend. Use tRPC for shared API types and React Query hooks for requests. Backend serves the built frontend and `/trpc` on port 3000.

Run `pnpm install` at the repository root, then `pnpm --filter game dev`. Build with `pnpm --filter game build`. Docker services are defined in the monorepo root `docker-compose.yml`.

SuperTokens handles Google login. `/admin` requires the `admin` role; Dashboard access is separate. Email test login is admin-controlled, defaults off, and never grants admin access. Keep authorization in backend procedures; persist settings in `DATA_DIR`.

Keep rules, payouts, star awards, and settings reusable by simulations. Enforce `docs/games.md` visibility and finale star advantage in backend responses as well as UI.

Develop in two phases:
1. Functionality: verify all behavior with a very simple UI. Keep game logic, state, and API interactions separate from presentation components and styling.
2. UI: redesign presentation only, without changing functional code or behavior.
