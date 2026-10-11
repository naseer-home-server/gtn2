# Game

This project has a Vite + React + TypeScript frontend and Express backend. The frontend fetches `/api/hello`; the backend serves the built frontend and API on port 3000.

Run `pnpm install` at the repository root, then `pnpm --filter game dev`. Build with `pnpm --filter game build`. Docker services are defined in the monorepo root `docker-compose.yml`.

Keep rules, payouts, star awards, and settings reusable by simulations. Enforce `docs/games.md` visibility and finale star advantage in backend responses as well as UI.
