# Cooperation, detection, and retaliation

Review of the current [game rules](games.md) and engine, 16 October 2026. These are strategies available under the current rules, not additional rules or instructions for simulation players. Assume one identified defector and that every other team follows the proposed response; smaller or unreliable coalitions weaken it. Defection means breaking a negotiated agreement, rather than making an illegal game action.

## What a public reveal buys

A public reveal identifies relative balance leaders and makes a common ranking snapshot available for discussion. It can help a coalition select a target, assess whether its agreements are sharing gains, and decide whether to keep supporting someone. It does not reveal actions, balances, earnings, or private transfers, so a high rank is not proof of cheating. Earlier earnings, legitimate deals, and the reveal payments themselves can explain a ranking. The snapshot is taken after contributions have been debited.

The new default public price is average current balance ÷ 3, rounded to the nearest 100, with the existing positive-balance minimum and first-game exception. Private price remains public price ÷ 5. With five teams, an equal public split costs each team exactly as much as its private reveal. With fewer teams, an equal public split costs each more than its private reveal. Public funding still has a free-rider problem: an abstaining team gets the rankings too. A coalition can fund it without the suspect; the suspect also sees it. Lower prices reduce the cost, but do not make accusations conclusive or coalition payments enforceable.

## Will we get bonus this year

**Detection:** A team taking a positive amount can sometimes infer that an agreed allocation failed from its own payout. A zero-taker earns zero regardless, so its game earnings provide no evidence of compliance. Different take patterns can produce the same payout. A public rank can add suspicion but generally cannot identify the culprit. The public round-three star identifies the payout winner, not necessarily a defector.

**Response if the culprit is known:** Withdraw the cooperative arrangement. Under the default bag and threshold of 100, every other team can take 100 next round. If the culprit takes anything positive, the threshold is exceeded and there are no zero-takers, so its payout is at most 100. If it takes zero, it earns zero. This removes its ability to exploit several zero-takers and the threshold bonus. For example, five teams can cooperate by having four take zero, one take 100, then share the resulting 4,000 in round three; that designated taker keeping the proceeds is a concrete betrayal. With everyone else taking 100 next round, its maximum direct payout is only 100.

**Limit:** This caps future earnings rather than confiscating the earlier gain. It also destroys the coalition's larger cooperative earnings. Side-payment refusal is directly observable to the intended recipient, but other teams must trust that recipient's report. Because this is the first game, later circle support and bomb targeting can make a more selective threat than repeating the group-wide response.

## High or low

**Detection:** A team promised a common high payout can see that it received less, but cannot usually identify which team undercut. A public rank gives relative positions, not the choices. The round-three star identifies the selected lowest team, which can support a specific inference if there was an agreement about who should be lowest.

**Response if the culprit is known:** All other teams choose zero. The culprit earns zero whatever it does: if it chooses above zero it receives the lowest choice, zero; if it chooses zero then every choice is zero, so even winning the tie pays zero. If it chooses a positive amount, one coalition member wins that amount and can redistribute it among cooperators with ordinary money transfers.

**Limit:** The coalition gives up its normal high payouts, and sharing any captured payout is another unenforced promise. This guarantees zero new game earnings for one outsider only when every other team follows the zero-choice plan; it does not reduce the outsider's accumulated balance. A plan with one coalition team choosing high is less robust because the culprit can also choose zero and potentially win on arrival order.

**Why betrayal can be tempting:** If everyone chooses the maximum, everyone earns the maximum. One team can undercut by one cent and retain the maximum payout while reducing every other team's payout. Its immediate benefit is a relative lead, without an increase in its own earnings. The current simulation objective prioritizes money taken home, so that relative lead alone is not a reason to undercut; the team must weigh any effects on its future earnings, trust, and retaliation.

## Cave mining

**Detection:** A collapse is a random outcome, not evidence of an early departure. Teams cannot see who left or how many remain. Their own payout and paid ranks generally cannot establish who broke a stay-together promise. The final cave star identifies the largest total banked, not departure timing.

**Response if the culprit is known:** Cooperators can leave early next round to bank safely and raise the next collapse risk for a culprit that remains. With five teams and four departures, that risk is 65% at the next check under the defaults. With seven teams, six departures raise it to 95%.

**Limit:** The culprit can leave in the same safe opening window or another open window before the check. Already banked money cannot be harmed. The response also exposes any remaining innocent teams and gives up the cooperators' growth opportunities. Cave therefore has a weak, avoidable in-game punishment; denying later support or targeting the finale is more selective.

## What goes around comes around

**Detection:** When returns open, a team learns its sender and exact incoming money/stars. Dividing incoming amounts by the multiplier identifies what that sender actually sent, allowing it to check a specific send promise. The sender of an insufficient return is harder to identify: a team sees the returned amount but its outgoing recipient remains hidden. Chat disclosures and distinctive public star changes can sometimes support an inference, but paid ranks do not disclose the circle.

**Response if the culprit is known:** If the culprit is your revealed sender, return zero money and stars, or less than your prior agreement. This directly withholds a benefit from that named team. A coalition can also exclude it from voluntary money-sharing deals and support trusted teams instead. If it becomes someone's sender again in a later round, the same conditional return policy is available.

**Limit:** The ordinary outgoing recipient is hidden during sending, so teams cannot reliably target a send boycott at one named team. Random reshuffles also make future return relationships uncertain. A team whose recipient withheld a return may know it was cheated without knowing by whom. Return choices are simultaneous; a promise to pay back later is still unenforced. Withholding returns denies future benefits but cannot recover money already sent to the culprit. Stars change through sends and returns, so retaliation can also affect who receives the finale advantage.

## Gamble bomb finale

**Detection:** Everyone sees the recipient, but only that recipient sees up/down; nobody sees other teams' allocations. A bad outcome does not identify who supplied the chits. Public ranks help select a balance leader to target, rather than proving who broke a bomb agreement.

**Response if the culprit is known:** Coalition members put their direction chits on down and their recipient chits on that team. This can reduce its existing balance, rather than merely deny future earnings. Both chits must be drawn as intended; direction and recipient are separate pooled draws. Opposing allocations can produce an up bomb for the target or a down bomb for an innocent team.

**Limit:** The most-starred team's 60-chit limit can substantially resist a coalition. For example, four standard teams contribute at most 80 down chits against its 60 up chits: the probability of down is 80/140, about 57%, before considering the recipient draw. With fewer opponents its advantage is larger. Even at zero balance, a down bomb cannot impose a monetary loss. In the final round there is no later gameplay punishment for breaking the coalition agreement, so reputation alone cannot enforce it within this session.

## Implications for the next simulation

Cheaper public reveals make identifying and coordinating against leaders more affordable. They do not by themselves solve identification or make retaliation credible. Compare public/private reveal use, coalition funding, fulfilled transfer promises, and responses to observed betrayals before concluding that models have become more cooperative.

The most useful distinction is between detecting a broken agreement, identifying the team responsible, and having a response that cooperators benefit from carrying out. Bonus and cave have costly group-wide responses; high or low can deny an outsider earnings; circle can withhold a named sender's return; bomb can attack accumulated wealth probabilistically. General money transfers let coalitions exclude an identified team from benefits throughout play, but do not create new money or recover its existing balance.

If stronger accountability is desired later, a separate paid action audit could reveal a specific past action without exposing balances, and revealing a circle return's source would address its particular attribution gap. Those would change the information rules and have not been implemented here. Simulation briefings should continue to describe the existing options neutrally rather than force cooperation or treat rank as proof.
