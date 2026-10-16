# Gameplay API

The UI and AI simulation use the same server rules and filtered player views. The simulation console runs through an opt-in machine API described below.

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
| `pot.contribute` | `amount`, optional `scope`: `public` or `self` (defaults to `public`) | Positive funds and an open selected pot |
| `money.transfer` | `recipientTeamIds`, `amount` (total), optional `allocations`: `{teamId, amount}[]` | Playing, positive balance, and no public reveal |
| `reveal.acknowledge` | None | Your ranking snapshot is present |

Money fields accept nonnegative decimal strings or numbers in currency units; prefer strings. Player-view amounts are strings with two decimal places. Stars and chits are whole numbers. Both bomb piles independently require their minimum/maximum **total**; individual options may be zero. Omitted recipient counts mean zero.

A transfer's `amount` is the total to send among one or more distinct recipient teams. The recipient list cannot include the sender, and each recipient must be a team in the session. The total may not exceed the sending team's current balance. When `allocations` is provided, it must contain exactly one positive amount for each recipient, and the shares must add up to `amount`. Without `allocations`, the total is divided equally in integer cents, with leftover cents assigned one at a time in frozen team tie order (team UUID breaks any tie); for example, `1.00` split among three teams gives `0.34`, `0.33`, and `0.33`. The split is all-or-nothing. Transfers apply immediately, preserve the combined balance, and do not change the current token or game choice. They are accepted in the ready phase, during any active game phase (including after that team's choice), and after a round completes while the session remains playing. A public ranking reveal pauses transfers until every team acknowledges; a private self-rank reveal does not pause other teams. `allowedActions` includes `money.transfer` for a team leader with a positive balance when no public reveal is active, including while a round is ready. Every recipient ID must be a team UUID at the API boundary.

The view provides own balance and earnings, public names/stars/public-pot progress, that team's private-pot progress, current tuning in `rules`, filtered `roundState`, and `moneyTransfers`. A rank is omitted until a reveal. A self-scope reveal contains only that team's rank and is visible only to that team; it does not pause other teams. A public-scope reveal contains every rank and is visible to every team; play and cave timing pause until all teams acknowledge. Each team's snapshot disappears on its acknowledgment. Transfer receipts include the ID, sender team ID, recipient team ID, and decimal-currency amount, but a team sees only receipts involving itself. The field is empty while waiting or unassigned. Views never include other balances, private choices, full circles, cave attendance, or non-recipient bomb direction. The star advantage appears only when the finale begins.

The first game's public and private reveal prices are fixed at 100 and 20. At the start of each later game, the public price is recalculated as average current team balance ÷ 3 × `revealPotMultiplier` (default 1), rounded to the nearest 100 with halfway values rounding up and a 100 minimum for a positive combined balance. Past reveal-pot spending is not added back. The private price is one fifth of the rounded public price. These prices stay fixed for the three rounds of that game.

## Host and engine

Admin-only tRPC procedures: `admin.game.defaults`, `state({sessionId})`, `start({sessionId, teams, config})`, `startRound({sessionId})`, and `advance({sessionId})`. Teams use invited **player IDs**, with one or two arrived members each and at most one solo team. `start` freezes configuration and tie order and prepares round 1 without starting play; `startRound` launches that prepared first round. After each later round completes, `advance` starts the next round only when the host chooses it. Admin state includes the complete chronological event audit, including submitted commands and random outcomes.

The `backend/engine` export provides `startEngine`, `applyAction`, `tickEngine`, `advanceEngine`, `playerView`, and shared types/defaults. It has no auth, database, or UI dependency. Inject time, random draws, and tokens for deterministic simulations. Engine/admin-state money uses arbitrary-precision **integer-cent strings**, distinct from player API currency strings. PostgreSQL serializes mutations with row locks, persists state/events together, and deduplicates commands. A committed transfer emits `money.transferred` in the admin audit; retries use the same request ID, token, and action and do not transfer twice. Current-game reset removes transfers made since that game's checkpoint while retaining earlier receipts; old checkpoints without a transfer count reset the receipt ledger to empty. Only the active session's cave timer runs; reactivation processes one overdue tick, rather than replaying elapsed ticks.

## Simulation bridge

Configure a `SIMULATION_SERVICE_KEY` of at least 32 characters to enable `/api/simulation`. Every bridge request requires that secret in `x-simulation-service-key`; player routes additionally require a scoped bearer capability. The trusted simulation runner owns these credentials and exposes named operations to models. Normal human authentication remains through SuperTokens.

- `POST /api/simulation/sessions` accepts a UUID `requestId`, `name`, `teamCount` (2–5), `seed`, and shared `config`. It creates invited account records and arrived pairs, randomizes roster/tie priority, prepares the first round, and activates the session. It returns `sessionId` and agent records with scoped credentials. Retrying identical setup returns the same session and capabilities; changing the payload under the same ID fails.
- `GET /api/simulation/sessions/:sessionId` is a trusted runner view of engine state, audit, revision, and logical time. Models never receive this raw response.
- `POST /api/simulation/sessions/:sessionId/control` accepts UUID `requestId`, `operation` (`start`, `advance`, or `tick`), and optional `expectedToken`. Commands are deduplicated and guarded against stale tokens. A tick advances virtual time to one pending cave deadline and processes exactly one check.
- `GET /api/simulation/sessions/:sessionId/players/:agentId/state` and `POST .../actions` use the existing player-view/action repositories, including leader restrictions, allowed actions, command tokens, and idempotency. The bearer capability is bound to the invited player, session, and agent; changing the route cannot impersonate another team.
- Player-scoped `chat/inbox`, `chat/direct`, `chat/groups`, `chat/messages`, and `chat/send` use the existing chat repository and membership checks.

Simulation-owned sessions persist their clock and seeded random state atomically with accepted gameplay mutations. The automatic wall-clock timer skips them; ordinary human sessions retain existing timing. Starting a simulation changes the shared active session, so human play and simulations must run at different times. Old saved sessions are retained.

See [the simulation README](../ai-simulation/README.md) for console setup, environment variables, run controls, and Docker Compose.
