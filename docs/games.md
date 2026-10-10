# Game rules

## Shared rules
- Five games, three rounds each; potential winnings increase across rounds and games.
- Up to five teams of two; odd attendance leaves one solo team. “Player” means team.
- Round winnings enter each team's accumulated balance. Transfers and bombs affect this balance.
- Rank teams by account balance. Each team sees only its own position; other teams' positions and balances are hidden.
- Game information is limited to the visibility rules below, in addition to the team's own rank.
- A reveal pot is always available. Teams can contribute any amount at any time. When it reaches a target based on teams' earnings, reveal every team's rank once, but not balances or earnings. Rankings are hidden again after the reveal; fill the pot again for another reveal.
- Break all ties using a fixed team order based on each team's first member to arrive.
- Tune game defaults and round overrides through playtesting; share configuration with simulations. Values below are drafts; “TBD” means unset.
- Still undecided: stake schedules, initial balance, and money precision/rounding.

The reveal target formula is TBD and should be tuned through playtesting; average earnings is one example. Keep the formula configurable.

## Will we get bonus this year

| Parameter | Draft value |
| --- | --- |
| Bag amount | 100 |
| Collective threshold | 100 |
| Bonus multiplier | TBD per round |

Each team takes between zero and the bag amount. Its payout is the amount taken multiplied by two independent bonuses:

- **Threshold bonus:** the bonus multiplier if the total taken is at most the collective threshold; otherwise 1.
- **Zero-taker bonus:** the number of teams taking zero, with a minimum of 1.

**Visible:** only the team's own earnings for each round; no other choices, totals, or bonus breakdowns.

## What goes around comes around

| Parameter | Draft value |
| --- | --- |
| Transfer multiplier | TBD per round |

Randomly link teams into one or more circles. Each sends any amount up to its balance to the next team in its circle; the recipient receives that amount × transfer multiplier. Each may return any amount up to its current account balance to its sender; returns are not multiplied.

**Visible:** the team's sender and amount received. Its recipient and the circle structure are hidden.

Pending: whether links change each round.

## Gamble bomb

| Parameter | Draft value |
| --- | --- |
| Minimum chits per pile | 1 |
| Maximum chits per pile | 20 |
| Bomb factor | TBD per round |

Each team allocates between the minimum and maximum chits to each of two piles: direction (up/down) and recipient (team names). Draw one chit from each pile. Multiply the recipient's accumulated balance by the bomb factor for up, or divide by it for down.

**Visible:** everyone knows the recipient; only that team knows up/down. Chit allocations and pile totals are hidden.

Pending: recipient eligibility.

## High or low

| Parameter | Draft value |
| --- | --- |
| Base pool | 100 |
| Stake multiplier | TBD per round |

Each team chooses between zero and base pool × stake multiplier. The lowest team earns the highest chosen amount; every other team earns the lowest chosen amount. Use the shared tie order to select one lowest team.

**Visible:** only the team's own earnings for each round; choices, highest/lowest amounts, and other teams' outcomes are hidden.

## Cave mining

| Parameter | Draft value |
| --- | --- |
| Starting money | TBD per round |
| Growth multiplier | TBD per round |
| Tick interval | 10 seconds |
| Collapse risk by teams departed (0 / 1 / 2 / 3 / 4) | 5% / 20% / 40% / 60% / 80% |

Each team begins with the starting money unbanked. Every tick:

1. Check for collapse using the risk for teams already departed. Collapse ends the round; teams still inside earn zero.
2. If the cave survives, multiply unbanked money by the growth multiplier.
3. Teams choose to stay or leave. Leaving banks their current money and increases risk for the next tick.

Previously banked money is safe. There is no tick limit; play ends on collapse or when all teams leave.

**Visible:** only the team's current unbanked money for this tick. Other teams' decisions, balances, and the number still in the cave are hidden.
