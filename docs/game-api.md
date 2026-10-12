# Gameplay API

The UI and future AI players use the same server rules. `ai-simulation/` is not implemented yet.

## Player loop

Authenticate using the existing SuperTokens flow as an invited email in the active session. Then:

1. `GET /api/game/state` returns only your team's permitted information.
2. The team's leader chooses an action listed in `allowedActions`; teammates discuss choices with that leader in person.
3. `POST /api/game/actions` with a fresh UUID `requestId`, the current `token`, and an `action`. The response is your updated view.
4. Poll for phase changes and other teams' submissions. Acknowledge any reveal before continuing.

```json
{
  "requestId": "be30e526-b9ee-47ad-a89c-50d31d33f46a",
  "token": "<state.token>",
  "action": { "type": "bonus.take", "amount": "25.00" }
}
```

Use the SuperTokens client's cookie/header session handling, including its anti-CSRF and refresh flow. HTTP clients can use header sessions with `Authorization: Bearer <access token>`; explicitly request `st-auth-mode: cookie` during login if choosing cookies instead. These routes share authorization with tRPC `game.state` and `game.action`; they do not accept a caller-supplied team identity. Responses use `Cache-Control: no-store`.

Retry uncertain requests with the **same ID, token, and action**. A committed duplicate returns the current view without applying it again. Reusing an ID for a different command fails. A new action with an outdated token fails; fetch state again. Only the team leader can submit an action; the first accepted submission for a game decision is final.

## Actions

| Type | Fields | When |
| --- | --- | --- |
| `bonus.take` | `amount` | Bonus choice |
| `high-low.choose` | `amount` | High/low choice |
| `cave.decide` | `decision`: `stay` or `leave` | Survived tick, before deadline |
| `circle.send` | `money`, `stars` | Outgoing transfer |
| `circle.return` | `money`, `stars` | Return to your sender |
| `bomb.allocate` | `up`, `down`, `recipients`: team-ID → chit count | Finale choice |
| `pot.contribute` | `amount` | Positive funds and an open pot |
| `money.transfer` | `recipientTeamIds`, `amount` (total) | Playing, positive balance, and no active reveal |
| `reveal.acknowledge` | None | Your ranking snapshot is present |

Money fields accept nonnegative decimal strings or numbers in currency units; prefer strings. Player-view amounts are strings with two decimal places. Stars and chits are whole numbers. Both bomb piles independently require their minimum/maximum **total**; individual options may be zero. Omitted recipient counts mean zero.

A transfer's `amount` is the total to split equally among one or more distinct recipient teams. The recipient list cannot include the sender, and each recipient must be a team in the session. The total must round to at least one cent per recipient and may not exceed the sending team's current balance. Split integer cents evenly; distribute leftover cents one at a time in the frozen team tie order (team UUID breaks any tie). For example, sending `1.00` to three teams gives `0.34`, `0.33`, and `0.33` in that order. The split is all-or-nothing. Transfers apply immediately, preserve the combined balance, and do not change the current token or game choice. They are accepted in the ready phase, during any active game phase (including after that team's choice), and after a round completes while the session remains playing. The host's ranking reveal pauses transfers until every team acknowledges. `allowedActions` includes `money.transfer` for a team leader with a positive balance when no reveal is active, including while a round is ready. Every recipient ID must be a team UUID at the API boundary.

The view provides own balance/rank/earnings, public names/stars/pot, current tuning in `rules`, filtered `roundState`, and `moneyTransfers`. Transfer receipts include the ID, sender team ID, recipient team ID, and decimal-currency amount, but a team sees only receipts involving itself. The field is empty while waiting or unassigned. Views never include other balances, private choices, full circles, cave attendance, or non-recipient bomb direction. The star advantage appears only when the finale begins. During reveals, play and cave timing pause until all teams acknowledge; each team's snapshot disappears on its acknowledgment.

## Host and engine

Admin-only tRPC procedures: `admin.game.defaults`, `state({sessionId})`, `start({sessionId, teams, config})`, `startRound({sessionId})`, and `advance({sessionId})`. Teams use invited **player IDs**, with one or two arrived members each and at most one solo team. `start` freezes configuration and tie order and prepares round 1 without starting play; `startRound` launches that prepared first round. After each later round completes, `advance` starts the next round only when the host chooses it. Admin state includes the complete chronological event audit, including submitted commands and random outcomes.

The `backend/engine` export provides `startEngine`, `applyAction`, `tickEngine`, `advanceEngine`, `playerView`, and shared types/defaults. It has no auth, database, or UI dependency. Inject time, random draws, and tokens for deterministic simulations. Engine/admin-state money uses arbitrary-precision **integer-cent strings**, distinct from player API currency strings. PostgreSQL serializes mutations with row locks, persists state/events together, and deduplicates commands. A committed transfer emits `money.transferred` in the admin audit; retries use the same request ID, token, and action and do not transfer twice. Current-game reset removes transfers made since that game's checkpoint while retaining earlier receipts; old checkpoints without a transfer count reset the receipt ledger to empty. Only the active session's cave timer runs; reactivation processes one overdue tick, rather than replaying elapsed ticks.
