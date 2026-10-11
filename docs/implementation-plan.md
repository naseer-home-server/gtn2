# Gameplay implementation

1. Pure TypeScript engine: teams, round configuration, five games, money/stars, reveal pot, fixed tie order, deterministic injected randomness and time.
2. PostgreSQL service: lock each session for mutations; persist state and every command/outcome together; deduplicate request IDs. Keep active-session membership and team ownership on the server.
3. APIs: player state/action endpoints with filtered views; admin setup, progression, full state and event history. AI clients can use the same APIs directly.
4. Simple shadcn UI: admin team setup/configuration/game controls/action log; player forms for legal actions and private results.
5. Independent GPT-6 Luna checks: every game's payouts, round transitions, ties, limits, visibility, replayed/stale requests, timer behavior, and an entire playthrough. Check the real database and browser integration.

AI simulation remains a future consumer of the engine and APIs. No code goes in `ai-simulation/` in this work.

Implemented with three GPT-6 Luna workers: early games/tests, circle/finale/tests, and UI integration. Independent reviews cover visibility and a full playthrough; PostgreSQL tests roll back their fixtures. API usage is documented in [game-api.md](game-api.md).
