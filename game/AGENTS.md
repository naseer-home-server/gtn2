# Game

Vite + React + TypeScript player app; currently the starter scaffold. Login and gameplay are future work.

From the repo root: `pnpm install`, then `pnpm --filter game dev`, `build`, `lint`, or `preview`.

Keep rules, payouts, star awards, and configurable settings separate from UI for simulation reuse. Model each team as one player with a persistent balance and arrival-based tie priority. Build for mobile use. Enforce `docs/games.md` visibility and finale star advantage in team-facing data and UI. See root `AGENTS.md` for context.
