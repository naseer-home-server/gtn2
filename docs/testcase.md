# Browser test cases

Manual browser end-to-end coverage recorded on 2026-10-11; this checklist was updated on 2026-10-14 for features merged since then. Three fixtures completed all 15 rounds (45 rounds total). The [full report](e2e-browser-report.md) includes final balances, evidence, and the two privacy bugs found under the earlier realtime pot-pricing rule. Those observations are historical; the current regression cases are listed below.

## Setup and access

- [x] Create a session with nine invitees; mark arrivals, reorder them, then restore and freeze the arrival order.
- [x] Assign four pairs and one solo team; start with valid configuration.
- [x] Reject malformed configuration, `tickSeconds: 0`, duplicate emails differing by case, and an eleventh invite.
- [x] Reject an outsider and a player invited only to an inactive session.
- [x] Deny a player access to the admin route.
- [x] Disable email test login: hide passwordless login and deny the existing test login. Re-enable it and restore access.
- [x] Verify both teammates see the team's submitted choice and the first submission locks the team choice.
- [ ] Verify the earlier-arriving teammate is the team leader: only that player can submit game actions, transfer money, contribute to a reveal pot, or acknowledge a reveal; both teammates can see the team's permitted view.
- [x] Reload a player page and verify balance and game state persist.

## Team money transfers

- [ ] Split a transfer equally among multiple recipients; verify leftover cents follow frozen team arrival order, and verify a custom allocation debits and credits the exact shares.
- [ ] Verify transfers are available while a round is ready, after the sender has submitted a choice, and between rounds; the game phase, choice, and state token stay unchanged.
- [ ] Verify only the sender and recipients see each receipt, including for nonleaders; unrelated teams see no transfer details.
- [ ] Reject zero or negative totals, overspending, self/duplicate/unknown recipients, too many recipients, and allocations that do not exactly match the total; verify rejected transfers change no balances.
- [ ] Verify transfers are unavailable during a public ranking reveal and become available after all teams acknowledge; a private reveal does not block other teams' transfers.
- [ ] Retry a committed transfer with the same request ID and verify it is applied only once.

## Player chat

- [x] Send a message from a nonleader in a direct team conversation and in a group conversation; verify a reply appears through polling.
- [x] Load an older page of messages and verify messages remain in chronological order.
- [ ] Open a direct conversation from both teams and verify it reuses the same thread; create a group and verify only its selected members can read or send messages.
- [ ] Verify the inbox lists invited players and team membership without exposing balances, ranks, earnings, or private gameplay state.
- [ ] Verify chat remains available independently of gameplay progress and that conversations/messages persist for the session lifetime.

## Shared rules and reveal pots

- [ ] Verify teams see their own balance, public team names and stars, but no rank before a paid reveal.
- [ ] Verify public and private pot prices start at 100 and 20, stay fixed during game 1, then recalculate only at the start of games 2–5 using the documented formula and rounding.
- [ ] Partially fund both pots; verify their targets stay fixed within a game and private-pot progress is visible only to that team.
- [ ] Complete the public pot; verify every team sees every rank, contributions debit balances, the pot resets, and play waits for all acknowledgments.
- [ ] Complete a private pot; verify only the contributing team sees its rank, other teams continue playing, and its snapshot hides after acknowledgment.
- [ ] Verify the host cannot advance while a public reveal is unacknowledged.
- [x] Acknowledge from each team; verify each team's snapshot hides on its own acknowledgement and play resumes after all acknowledge.
- [x] Start a reveal during Cave and wait more than one tick interval; verify Cave remains paused and resumes after all acknowledgements.
- [x] Historical run: pot-target changes exposed Cave departures and Bomb outcomes. See [historical privacy findings](e2e-browser-report.md#historical-privacy-findings).

## Will we get bonus this year

- [x] Complete all three rounds and verify payouts with independent zero-taker and threshold bonuses.
- [x] Verify a threshold-exceeded round still applies the zero-taker bonus.
- [x] Test all-zero choices and resolve the round-three star tie by arrival order; verify the star is public.
- [x] Disable a negative choice and a choice above the bag limit.
- [x] With two teams and no zero-takers, verify the zero-taker multiplier has a minimum of one.
- [x] Test a fractional take and verify two-decimal payouts.

## High or low

- [x] Complete all three rounds and verify lowest earns the highest choice while other teams earn the lowest choice.
- [x] Tie for lowest and verify arrival order selects the winner.
- [x] Test all-zero choices.
- [x] Disable a choice above the round limit; tested a negative input only for Bonus.
- [x] Verify the round-three star award is public.

## Cave mining

- [x] Verify the first tick waits before growth and respects the configured interval.
- [x] Leave after survival; verify the current amount is banked and remains safe after collapse.
- [x] Leave in successive rounds with increasing starting amounts and growth; verify only teams still inside lose unbanked money on collapse.
- [x] Leave no one; verify unanswered teams default to stay and the cave grows across multiple ticks.
- [x] Submit an explicit Stay action; verify it is accepted.
- [x] Verify all teams leaving ends the round without collapse.
- [x] Set 100% collapse risk; verify collapse occurs at tick zero, before growth or decisions, and balances stay unchanged.
- [x] Verify the round-three star goes to the team with the most cumulatively banked Cave money.
- [x] Submit a stale-tick decision and retry; verify both are rejected, then refresh and submit a current decision.
- [x] Historical run: the reveal-pot target disclosed departures; current regression case is that targets remain fixed for a game.

## What goes around comes around

- [x] Verify five-team cycles have no self-recipient and groups are reshuffled between rounds.
- [x] Observe the 3+2 grouping and a five-team cycle in a separate fixture.
- [x] Send money and stars; verify incoming amounts and stars use the round multiplier.
- [x] Verify the team sees its sender and received amounts, while its recipient and circle layout stay hidden.
- [x] Return money and stars without a multiplier; verify return can exceed the amount received when account balance allows.
- [x] Send and return a full account balance; test zero sends and zero returns.
- [x] Verify this game awards no stars.

## Gamble bomb finale

- [x] Reveal the most-starred team's advantage only at the finale; verify standard and advantaged limits (20 and 60 per pile).
- [x] Tie the star count and verify arrival order selects the advantaged team.
- [x] Disable empty piles, fractional chits, over-limit standard allocations, over-limit recipient piles, and a direction pile above its limit.
- [x] Accept individual zero recipient options and valid allocations where direction and recipient pile totals differ.
- [x] Resolve up and down outcomes at factors 2, 5, and 10; verify two-decimal division rounding.
- [x] Verify the public recipient is shown, direction is shown only to the recipient, and nonrecipients' balances do not appear in their UI.
- [x] Historical run: the public pot target exposed direction and recipient balance; current regression case is that targets remain fixed for a game.
- [x] Verify no stars are awarded in the finale and the host cannot advance beyond the finished game.

## Coverage not completed

- [ ] External Google OAuth (testing used local email login).
- [ ] Lost-network retry and response-after-commit request deduplication.
- [ ] Statistical verification of weighted draw frequencies.
- [ ] Negative High-or-low input (the over-limit case was tested).

Browser test evidence and fixture IDs are listed in [the full report](e2e-browser-report.md).
