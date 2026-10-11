# Game Theory Night 2

A night for friends inspired by Tom Scott’s **Money**: five games, three rounds each, increasing stakes. Play as teams of two (one solo team if needed), up to five teams. Each team is one “player,” with a balance carried across rounds/games; ties use a fixed order based on each team's first member to arrive.

- `presentation/`: future HTML presentation.
- `game/`: Vite + React + TypeScript app for player login and gameplay.
- `ai-simulation/`: future multi-agent chat interface for playtesting and balance.

Use pnpm. Keep the unimplemented folders empty until requested. Read [rules, tuning, and visibility](docs/games.md) before gameplay work. Potential winnings increase across rounds and games. Treat values and star awards as drafts; star counts are tunable for every game except the circle game and finale. Gamble bomb is the finale; most stars grant a significant advantage revealed only then. Share rules/configuration between live play and simulations. Teams see only their own rank except during a reveal; rankings hide again afterward, and balances/earnings stay private.
