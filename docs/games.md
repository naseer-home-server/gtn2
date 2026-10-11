# Game rules

## Shared rules
- Five games, three rounds each; potential winnings increase across rounds and games. Current order: Will we get bonus this year → High or low → Cave mining → What goes around comes around → Gamble bomb finale.
- Up to five teams of two; odd attendance leaves one solo team. “Player” means team.
- Round winnings enter each team's accumulated balance. Transfers and bombs affect this balance.
- Start with each team's balance at 0. Rank teams by balance. Each team sees only its own position; other teams' positions and balances are hidden except during a reveal.
- Game information is limited to the visibility rules below, in addition to the team's own rank.
- Teams may spend money from their accounts into the reveal pot at any time. Its progress and target are visible to every team; its target starts as average team earnings and remains configurable. Cap a contribution at the remaining amount needed to fill it. The instant it reaches its limit, reveal all rankings (never balances or earnings), reset the pot to 0, and hide rankings again. Contributions are spent and gone; fill it again to reveal again.
- Stars and star totals are public. Stars are awarded during the first four games. The team with the most stars gets a significant advantage in the final game; keep the nature of that advantage secret until then. Do not award stars in the finale.
- Break all ties using a fixed team order based on each team's first member to arrive.
- Tune game defaults and round overrides through playtesting; share configuration with simulations. Values below are drafts; “TBD” means unset.
- Round fractional money to two decimal places. High-or-low stake multipliers and the bomb factor use the round values below.

For now, interpret average earnings as the mean earnings across teams; refine the exact formula during playtesting.

## Will we get bonus this year

| Parameter | Draft value |
| --- | --- |
| Bag amount | 100 |
| Collective threshold | 100 |
| Bonus multiplier | Round 1: 3; round 2: 5; round 3: 10 |
| Stars awarded | 1 to the round-three payout winner (draft) |

Each team takes between zero and the bag amount. Its payout is the amount taken multiplied by two independent bonuses:

- **Threshold bonus:** the bonus multiplier if the total taken is at most the collective threshold; otherwise 1.
- **Zero-taker bonus:** the number of teams taking zero, with a minimum of 1.

**Visible:** only the team's own earnings for each round; no other choices, totals, or bonus breakdowns.

## High or low

| Parameter | Draft value |
| --- | --- |
| Base pool | 100 |
| Stake multiplier | Round 1: 2; round 2: 5; round 3: 10 |
| Stars awarded | 2 to the round-three winner (draft) |

Each team chooses between zero and base pool × stake multiplier. The lowest team earns the highest chosen amount; every other team earns the lowest chosen amount. Use the shared tie order to select one lowest team.

**Visible:** only the team's own earnings for each round; choices, highest/lowest amounts, and other teams' outcomes are hidden.

## Cave mining

| Parameter | Draft value |
| --- | --- |
| Starting money | Round 1: 5; round 2: 10; round 3: 25 |
| Growth multiplier | Round 1: 2; round 2: 3; round 3: 4 |
| Tick interval | 10 seconds |
| Collapse risk by teams departed (0 / 1 / 2 / 3 / 4) | 5% / 20% / 40% / 60% / 80% |
| Stars awarded | 3 to the team with the most banked across all rounds (draft) |

Each team begins with the starting money unbanked. Every tick:

1. Check for collapse using the risk for teams already departed. Collapse ends the round; teams still inside earn zero.
2. If the cave survives, multiply unbanked money by the growth multiplier.
3. Teams choose to stay or leave. Leaving banks their current money and increases risk for the next tick.

Previously banked money is safe. There is no tick limit; play ends on collapse or when all teams leave.

**Visible:** only the team's current unbanked money for this tick. Other teams' decisions, balances, and the number still in the cave are hidden.

## What goes around comes around (second-last game)

| Parameter | Draft value |
| --- | --- |
| Transfer multiplier | Round 1: 3; round 2: 5; round 3: 10 |

Randomly reshuffle teams into one or more circles every round. Circles must have at least two teams; with five teams, valid group sizes include 5 or 3+2. Each sends any amount up to its balance and any number of stars up to its star balance to the next team in its circle. Multiply outgoing money and stars by the transfer multiplier. Each may return money and stars up to their current balances to their sender; returns are not multiplied. This game awards no new stars.

**Visible:** the team's sender and amounts received, including stars. Its recipient and the circle structure are hidden. Star totals remain public.

## Finale: Gamble bomb

| Parameter | Draft value |
| --- | --- |
| Minimum chits per pile | 1 |
| Maximum chits per pile, standard team | 20 |
| Maximum chits per pile, most-starred team | 60 (proposed) |
| Bomb factor | Round 1: 2; round 2: 5; round 3: 10 |
| Most-starred team advantage | 60 chits per pile instead of 20 (proposed; revealed in finale) |

The team with the most stars may allocate 1–60 chits per pile; every other team may allocate 1–20. Reveal this advantage when the finale begins. Each team allocates chits to both piles: direction (up/down) and recipient (team names). Draw one chit from each pile. Multiply the recipient's accumulated balance by the bomb factor for up, or divide by it for down. No stars are awarded in the finale.

**Visible:** everyone knows the recipient; only that team knows up/down. Chit allocations and pile totals are hidden.

Any team can receive the bomb. Resolve a tie for most stars using the shared arrival order.
