# Seven-team transition

## Rules and configuration

- Support 2–7 teams of two, with at most one solo team: up to 14 invited people and 13 or 14 playing in a seven-team game.
- New cave defaults use a 5% baseline and add 15 percentage points per departure: `[5, 20, 35, 50, 65, 80, 95]` for 0–6 departures.
- Cave's final decision window remains tick 10 by default. Anyone still inside automatically banks when that window expires.
- Choose each valid combination of circle sizes with equal probability, then shuffle teams into those circles. Six teams: `6`, `4+2`, `3+3`, `2+2+2`. Seven teams: `7`, `5+2`, `4+3`, `3+2+2`. Each option therefore has a 25% chance.
- Capacity comes from shared engine limits. Game tuning remains in `game/backend/src/engine/config.ts` and the simulation form. No additional circle config field is needed for equal probabilities.

## Code paths covered

| Area | Change |
| --- | --- |
| Shared engine limits | Central team, team-member, attendee, and transfer-recipient limits in `game/backend/src/engine/limits.ts`. |
| Human setup | Raise team assignment to seven, invitations and arrival reordering to fourteen; keep arrival-based leaders, unique members, and at most one solo team. |
| Simulation setup | Accept seven teams, generate fourteen accounts, create seven scoped agents, and validate the same engine limits. The default run size remains five; the form allows up to seven. |
| Cave | Accept seven-entry risk tables and index every departure count; derive labels and AI rules from the recorded table. |
| Circle | Generate every valid partition for six/seven teams. Retain the existing seeded behavior for two through five teams. |
| Transfers | Permit up to six recipients and six explicit allocations. Existing exact cent splitting, authorization, and private receipts apply. |
| Chat | Permit thirteen other group members plus the creator, through both the player API and simulation bridge. |
| Display | Show seven distinct account colours; roster, bomb-recipient, ranking, and transfer lists use the actual team list. |
| Simulation scheduling | Existing barriers and speaker swaps use roster length. Exhaustive swap coverage extends through seven teams. |
| Documentation | Update current rules, API limits, AI rule cards, and browser regression cases. |

## Saved sessions and operational effects

The database stores players as rows and engine state as JSON; this capacity change needs no SQL migration. Existing rosters, request IDs, stored setup signatures, and configuration snapshots stay valid. Five-entry cave tables are accepted as historical configuration; additional departures use the final listed risk. Existing fixtures and simulation runs can continue without reset or reseeding. For the new linear curve, start a run with the new defaults or edit its configuration before creating it.

The existing five-request model concurrency limit queues the extra requests safely. Seven players add 40% more player turns for the same schedule; token spend can increase further because each prompt carries more discussion history. Review actual live costs and wall-time pauses when tuning seven-team runs.

## Balance effects to review in playtesting

- Bonus: six zero-takers can multiply one designated taker's round-three payout to 6,000 with the current bag/threshold/multiplier, versus 4,000 with five teams.
- Reveal pots: private price remains one fifth of public price. With seven teams, an equal public contribution is public price divided by seven, cheaper per team than a private reveal. The public price derives from the median team balance.
- Bomb: at maximum allocations, the 60-chit star leader supplies 60/180 = 33.3% of each combined pile, versus 60/140 = 42.9% with five teams. Raising the advantage to 90 would preserve the former share against six standard 20-chit teams; this is a separate balance choice.
- Circle: multiple smaller circles change the range of cooperation opportunities. The equal-size-grouping policy is explicit so future balance experiments can compare it consistently.

## Verification scope

Automated coverage includes six-/seven-team fifteen-round playthroughs, every valid circle grouping with equal random intervals, cave risk at all departure counts, automatic final-tick banking, six-recipient transfers and receipt privacy, fourteen-person setup/chat, eighth-team/fifteenth-person rejection, and seven-team speaking-order permutations. PostgreSQL bridge tests cover seven agents, fourteen stored accounts, request retries, credentials, and logical cave time against the checkout's local database.

Browser regression cases are listed in `docs/testcase.md`. Browser execution is a separate pending check; historical browser results do not establish seven-team UI coverage.

Recorded validation: `pnpm test:db` passed all 80 checks with no skips against this checkout's Docker PostgreSQL; `pnpm --filter ai-simulation test` passed all 77 checks using mocked model endpoints. No paid completions were needed.
