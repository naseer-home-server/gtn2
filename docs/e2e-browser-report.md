# Browser E2E report

**Date:** 2026-10-11  
**Total:** 45 rounds across three completed 15-round fixtures  
**Main run:** Browser E2E2026-10-11  
**Fixtures:** Main `07efdf92-75f2-49d6-82b2-e109a147e5da`; edge `d6cad9c4-ec81-4f6b-9031-23a16b9b5aa1`; topology and collapse `4450d159-61c7-4898-a18f-8e0289b53926`

All three browser fixtures reached the finished state. No application code was changed.

## Historical privacy findings

These findings describe the realtime pot-pricing behavior observed on 2026-10-11. The feature work now locks pot prices for each game and recalculates only when a new game starts; these records remain as historical evidence, not current rules.

**P1 — Bomb resolution leaks the hidden direction and recipient balance through the public reveal-pot target.** Reproduction: note Beta's target at 523.60 before resolving bomb round 1; all teams allocate Up and Alpha is selected as the public recipient. Beta then sees the target rise to 642.48. The 118.88 increase, multiplied by five teams, is $594.40: exactly Alpha's balance change from $594.40 to $1,188.80. With the public recipient and 2× factor, Beta can infer “up” and Alpha's prior and resulting balance. Beta's UI omitted “Your direction,” but the target exposed it anyway. Evidence: [Beta accessibility capture](e2e-evidence/bomb-r1-beta.txt) and [Beta screenshot](e2e-evidence/bomb-r1-beta.jpg).

**P2 — Cave departures are exposed through the public reveal-pot target.** Reproduction: during Cave round 1, note Beta's target at $480.60, then have Alpha alone leave and bank $10 while the other teams remain inside. Beta sees the target change to $482.60. That change reveals that a team left and permits inferring the number still in the cave, which Cave's visibility rules hide. The paused-round evidence is in [saved Cave state](e2e-evidence/cave-paused-state.json).

**Shared cause at the time:** The pot target was derived from average accumulated balances plus past pot spending, and the engine refreshed it after actions and ticks. As balances changed during Cave departures or bomb resolution, the target became a side channel for private game state. The bomb case additionally revealed an exact balance change and direction. The updated rule keeps the target fixed through each game, removing those within-game target changes.

## Main five-team fixture

The main fixture used five teams: four pairs and one solo team. Nine invited accounts used email aliases with isolated browser cookies. Arrival order was edited and restored before play, then frozen at start. Final balances were Alpha $1,188.80, Beta $235.60, Gamma $243.00, Delta $25.00, and Epsilon $250.00. Final stars were 6, 1, 1, 8, and 2. The admin event log contained 91 `player.command` events, including choices and allocations, 10 reveal acknowledgements, and three pot contributions. Evidence: [event log](e2e-evidence/main-event-log.txt), [saved run states](e2e-evidence/main-run-states.json), and [finished admin screenshot](e2e-evidence/main-finished-admin.jpg).

- **Setup and access:** Invalid JSON and `tickSeconds: 0` were rejected. Duplicate email aliases differing only by uppercase were rejected, as was an eleventh invite. Outsider and inactive-session emails were denied. Player A2 saw “Admin access required” at the admin route. Turning off the email test-login setting denied existing test login and hid the passwordless form; turning it back on restored the cookies.
- **Persistence and team login:** Reloading Alpha preserved the balance and game state. A second player in a pair saw the first submitted team choice and no second submission form.
- **Bonus:** All rounds matched expected payouts, including independent zero-taker bonuses. In round 3, all teams chose zero; the payout tie awarded A one star by arrival order. Stars were public. A negative choice of -1 and over-limit choice of 101 were disabled.
- **High or low:** All rounds matched expected payouts. A tied-low case followed frozen arrival order; an over-limit choice of 201 was disabled. A negative high-or-low choice was not tested. B received two round-three stars; stars were public.
- **Cave:** Round 1: Alpha banked 10 safely while others collapsed for zero. Round 2: Beta banked 30 safely while others collapsed for zero. Round 3: Gamma banked 100 and received three stars for the largest cumulative Cave banking.
- **Reveal pot:** A partial contribution of 10 from A left the target at 72; Gamma's 62 completed the reveal. The target stayed fixed while filling. Completion reset the pot, debited contributors, and revealed rankings only. Admin advance was rejected until every team acknowledged; each team's ranking snapshot disappeared after its own acknowledgement. A second reveal at 480.60 paused the first Cave tick for over 30 seconds and resumed after all acknowledgements.
- **Circle:** All rounds completed with expected outcomes. The observed five-team topology was a reshuffled cycle with no self-recipient; 3+2 was not observed in this fixture. Round 1: $1 sends at 3× distributed 18 stars from six originals; eligible teams returned $2 and one received star, ending with A 6, B 1, C 1, D 8, E 2 stars. Round 2: each $1 send yielded $5 received; each team could return $10 and ended net +$4. Round 3: each $1 send yielded $10; no money was returned and each ended net +$9.
- **Finale:** Delta's 60-chit-per-pile advantage was revealed; others had 20. Zero-pile, standard 21-chit, and Delta 60-plus-one direction inputs were disabled; Delta's 60-per-pile allocation was accepted. In round 1, all teams allocated up and Alpha was selected; Alpha rose from $594.40 to $1,188.80 at 2×, and others were unchanged. Round 2 selected Beta down at 5×, taking $1,178.00 to $235.60. Round 3 selected Epsilon up at 10×, taking $25.00 to $250.00.

## Two-team edge fixture

This fixture used one pair and one solo team, initial balance $1.01, small game limits, zero star awards, and zero Cave collapse risk.

- **Bonus and high or low:** Round 1: both took $1 and earned $3 each. Round 2: A took zero and B took $1; B earned $5. Round 3: A took $0.01 and earned $0.10. All high-or-low choices were zero, producing zero payouts.
- **Cave:** Round 1 survived six ticks with unanswered decisions defaulting to stay; both then left and banked $320 each. In round 2, one explicit Stay action was accepted; A banked $270 and B $90. Round 3 both banked $400 after two ticks. All-left rounds completed with `collapsed: false`. A stale-tick action and retry with the same stale token were rejected; refreshing and submitting a current action succeeded.
- **Circle:** Rounds 1 and 3 sent zero. In round 2, A sent $994.11 and B $819.01 at 5×; after full returns, balances were $4,970.55 and $4,095.05.
- **Finale:** With zero stars tied, arrival order gave Alpha the 60-chit advantage. Fractional chits were disabled. Alpha's 60 down chits plus one recipient chit and Beta's one direction plus one recipient chit were accepted as independent pile allocations. Outcomes: Alpha $4,970.55 → $2,485.28 at 2× down; Alpha $2,485.28 → $497.06 at 5× down; Beta $4,095.05 → $409.51 at 10× down. Evidence: [edge event log](e2e-evidence/edge-event-log.txt) and [saved edge states](e2e-evidence/edge-run-states.json).

## Topology and immediate-collapse fixture

This fixture used five teams: four pairs and one solo team, initial balance $1.01, zero star awards, one-second Cave ticks, and 100% collapse risk at every departure count.

- **Cave:** All three rounds collapsed on tick 0, before growth; team balances stayed at $1.01.
- **Circle:** Round 1 formed groups of 2 and 3; sending zero and returning $1 from existing balances worked, leaving balances at $1.01 each. Round 2 formed one group of 5; each sent $1 at 5× and returned zero, ending at $5.01 each. Round 3 formed one group of 5; each sent $1 at 10× and returned zero, ending at $14.01 each.
- **Finale:** All teams had zero stars, so arrival order gave Alpha the 60-chit advantage. A recipient pile totaling 21 was disabled; Beta's one direction chit was valid. Mixed up/down allocations were accepted: Alpha allocated 30+30 direction chits and 60 recipient chits; other teams allocated 10+10 and 20 recipient chits. Zeroes in other recipient options were accepted. Outcomes were Epsilon up at 2× ($14.01 → $28.02), Alpha down at 5× ($14.01 → $2.80), and Alpha up at 10× ($2.80 → $28.00); other balances were unchanged. The fixture completed all 15 rounds. Evidence: [topology event log](e2e-evidence/topology-event-log.txt) and [saved topology states](e2e-evidence/topology-run-states.json).

## Remaining limitations

- External Google OAuth was not tested; the browser run used local email login.
- Lost-network behavior and response-after-commit request deduplication were not browser-verified. The stale Cave token rejection described above is the only retry behavior checked; it did not succeed until a fresh state/action was submitted.
- Finale controls accepted valid mixed allocations and observed draws matched their calculated outcomes; weighted frequencies were not statistically verified.
- The admin setup appears to allow starting with some arrived players unassigned if the selected teams satisfy the solo-team parity check. The rules do not clearly state whether every arrived player must participate, so this remains a design question rather than a confirmed bug.

The browser console showed 10 session-refresh attempts returning 401 while the email test-login setting was turned off. No request trace was captured, so this observation is not reported as a confirmed bug.

Browser workers' access disappeared during the run; the root tester continued testing directly. At teardown, the Testing locally setting was restored to Active with six invited and arrived players and email test login enabled. The dev server and port-forward process were stopped; ports 5173, 3000, 1233, and 5433 had no listeners. The only workspace additions are this report and its evidence files.
