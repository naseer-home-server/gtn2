# Game rules

## Shared rules
- Five games, three rounds each; potential winnings increase across rounds and games. Current order: Will we get bonus this year → High or low → Cave mining → What goes around comes around → Gamble bomb finale.
- Admins assign two to seven teams of two, with one solo team if needed. “Player” means team. The member with the earlier arrival order leads the team; only they can submit game decisions, make team money transfers, acknowledge a ranking reveal, or contribute to the reveal pot. Teammates discuss choices in person. A solo player is their own leader.
- Round winnings enter each team's accumulated balance. Any team may send a positive total to one or more other teams while play is active, including between rounds and after submitting its current game choice. Shares start as evenly as possible and the sender can edit each one; all shares must add up to the original total and each recipient must receive at least one cent. Transfers are immediate and preserve the combined balance. They are paused during public ranking reveals. Transfers and bombs affect team balances.
- Start with each team's balance at 0. Rank teams by balance. Ranks are hidden unless revealed through one of the paid reveal pots; balances stay private.
- Game information is limited to the visibility rules below. Each team can see only transfer receipts where it was the sender or recipient; other teams' transfers remain private.
- There are two reveal pots. The public reveal pot shows every team's rank to everyone. When filled, it reveals a ranking snapshot, resets to 0, and pauses play until every team acknowledges; each team's snapshot hides after its acknowledgment. The private self-rank pot shows only the contributing team's rank. It resets after the rank is revealed, and that team can acknowledge to hide its snapshot. A private reveal does not pause other teams. Both pots can be filled again.
- Stars and star totals are public. Stars are awarded during the first four games. The team with the most stars gets a significant advantage in the final game; keep the nature of that advantage secret until then. Do not award stars in the finale.
- Break all ties using a fixed team order based on each team's first member to arrive, frozen when play starts. The host advances completed rounds.
- Tune game defaults and round overrides through playtesting; share configuration with simulations. Values below are drafts; “TBD” means unset.
- Round fractional money to two decimal places. High-or-low stake multipliers and the bomb factor use the round values below.

In the first game, the public reveal price is fixed at 100 and each private self-rank price is 20. At the start of games 2–5, calculate the public price as the median current team balance ÷ 3, then round to the nearest 100 (halfway rounds up, with a 100 minimum when the combined balance is positive). For an even number of teams, the median is the average of the two middle balances. The configured `revealPotMultiplier` scales this amount before rounding and defaults to 1. Do not add past reveal-pot spending back into balances. The private price is one fifth of the rounded public price. Prices stay fixed for all three rounds of a game and change only when the next game starts. Spending on either pot therefore reduces the balance basis for later games. For example, a median balance of 1,200 gives a public price of 400 and a private price of 80.

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
| Stake multiplier | Round 1: 10; round 2: 50; round 3: 100 |
| Stars awarded | 2 to the round-three winner (draft) |

Each team chooses between zero and base pool × stake multiplier. The lowest team earns the highest chosen amount; every other team earns the lowest chosen amount. Use the shared tie order to select one lowest team.

**Visible:** only the team's own earnings for each round; choices, highest/lowest amounts, and other teams' outcomes are hidden.

## Cave mining

| Parameter | Draft value |
| --- | --- |
| Starting money | Round 1: 5; round 2: 5; round 3: 5 |
| Growth multiplier | Round 1: 2; round 2: 3; round 3: 4 |
| Tick interval | 10 seconds |
| Maximum ticks per round | 10 |
| Collapse risk by teams departed (0 / 1 / 2 / 3 / 4 / 5 / 6) | 5% / 20% / 35% / 50% / 65% / 80% / 95% |
| Stars awarded | 3 to the team with the most banked across all rounds (draft) |

Each team begins with the starting money unbanked and immediately gets a decision window. The first window is safe: teams can leave and bank their starting money without a collapse check. If the window expires, the first collapse check uses the risk for teams already departed. Collapse ends the round; teams still inside earn zero. If the cave survives, multiply unbanked money by the growth multiplier and open the next decision window. No response means stay. Leaving banks the current amount and increases risk at the next check.

Previously banked money is safe. Each round has at most 10 decision windows by default (`cave.maxTicks`), counting the safe opening window as tick 1. Tick 10 is the final decision window. When it expires, everyone still inside automatically banks their current unbanked money and the round ends, without another collapse check or growth into tick 11. Play may end earlier on a random collapse or when all teams leave.

**Visible:** the current tick, maximum ticks, and the team's current unbanked money. Other teams' decisions, balances, and the number still in the cave are hidden.

## What goes around comes around (second-last game)

| Parameter | Draft value |
| --- | --- |
| Transfer multiplier | Round 1: 3; round 2: 5; round 3: 10 |

Randomly reshuffle teams into one or more circles every round. Circles must have at least two teams; each valid combination of circle sizes is equally likely, then team assignments are shuffled. With six teams the options are 6, 4+2, 3+3, and 2+2+2; with seven teams they are 7, 5+2, 4+3, and 3+2+2. Each sends any amount up to its balance and any number of stars up to its star balance to the next team in its circle. Multiply outgoing money and stars by the transfer multiplier. Each may return money and stars up to their current balances to their sender; returns are not multiplied. This game awards no new stars.

**Visible:** the team's sender and amounts received, including stars. Its recipient and the circle structure are hidden. Star totals remain public.

## Finale: Gamble bomb

| Parameter | Draft value |
| --- | --- |
| Minimum chits per pile | 1 |
| Maximum chits per pile, standard team | 20 |
| Maximum chits per pile, most-starred team | 60 (proposed) |
| Bomb factor | Round 1: 2; round 2: 5; round 3: 10 |
| Most-starred team advantage | 60 chits per pile instead of 20 (proposed; revealed in finale) |

The team with the most stars may allocate 1–60 chits per pile; every other team may allocate 1–20. Reveal this advantage when the finale begins. Each team allocates chits to both piles: direction (up/down) and recipient (team names). Up and down share one direction-pile limit: for a standard team, their sum must be between 1 and 20, and either count may be zero. Independently, the sum across all recipient teams must be between 1 and 20; the two pile totals need not match. Draw one chit from each pile. Multiply the recipient's accumulated balance by the bomb factor for up, or divide by it for down. No stars are awarded in the finale.

**Visible:** everyone knows the recipient; only that team knows up/down. Chit allocations and pile totals are hidden.

Any team can receive the bomb. Resolve a tie for most stars using the shared arrival order.
