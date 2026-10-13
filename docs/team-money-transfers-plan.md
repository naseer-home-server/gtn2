# Team money transfers

## Scope

Add a global `money.transfer` gameplay action that splits a positive total amount of accumulated money among one or more other teams. Transfers are independent of each game's choice mechanics, do not award stars, and do not use a multiplier. The action is handled by the existing player command path, so leader authorization, row locking, command idempotency, and audit persistence remain shared with other actions.

## Behavior

- A transfer is valid only while the session status is `playing`, including round-ready and round-complete phases.
- The sending team's leader may transfer after submitting its game choice. The current game phase and choice remain unchanged.
- A transfer requires a list of one to four distinct, known recipient teams that excludes the sender. Each recipient's positive allocation and all allocations together must exactly match the sender's stated total. The sender must have enough balance.
- Fill allocations with an equal split by default, distributing leftover cents one at a time in frozen team tie order (team ID breaks ties). The sender may edit each allocation before sending. The action is all-or-nothing: reject it if allocations do not sum to the total, and debit exactly the sum credited to recipients.
- The action must use the current state token. Each per-recipient receipt gets an ID through the injected token function, but the current token remains unchanged. No star count or multiplier is read.
- Transfers are blocked for the duration of a public ranking reveal. A private self-rank reveal does not pause other teams. Existing public-reveal acknowledgment and stale-token behavior remains in force.

## State, reset, and audit

Engine state stores a chronological optional `moneyTransfers` receipt ledger. Each receipt has an ID, sender team ID, recipient team ID, and integer-cent share. A transfer to multiple teams creates one receipt per recipient. New playthroughs initialize an empty ledger. The game-start checkpoint stores the ledger length; resetting a game truncates the ledger to that point, preserving receipts from prior games. A legacy checkpoint with no saved length resets the ledger to empty. If a legacy state has no checkpoint and transfers have already happened, reset must not create a new checkpoint from the post-transfer state.

Each recipient share emits `money.transferred` with the receipt data. The existing command event and database transaction persist all shares and audit events together; duplicate retries do not apply any share twice.

## Player visibility and availability

Player views always include `moneyTransfers`. The list is filtered to receipts where the viewer's assigned team is sender or recipient, including for nonleaders. Amounts use decimal currency strings. The public team list is returned in frozen tie order so clients can preview leftover-cent allocation without exposing tie-order fields. Waiting or unassigned players receive an empty receipt list. No rank is included by default: a paid self-rank reveal is visible only to that team, while a paid public reveal exposes every rank to everyone. A team leader with positive balance sees `money.transfer` in `allowedActions` during every playing phase with no public reveal, including the ready phase and after the team's game choice is submitted. A public reveal suppresses the action.

At the API boundary, `recipientTeamIds` is validated as a unique array of one to four UUIDs, matching actual team IDs. Optional `allocations` must contain one unique `{teamId, amount}` per recipient, with positive shares summing exactly to the transfer total. Omitting allocations preserves equal-split behavior for existing API clients. Pure engine calls accept simple IDs for deterministic engine use and validate recipient count, uniqueness, membership, sender exclusion, and balance conservation.

## Validation

The backend contract should be checked for: exact total splitting and deterministic remainder distribution; minimum one cent per recipient; duplicate, self, unknown recipient, overspend, and stale-token rejection; all-or-nothing balance conservation; unchanged phase, choice, and current token; allowed action in ready and post-submission states; reveal suppression; filtered receipt visibility; current-game reset truncation and legacy checkpoint behavior; and one-time application under retries.
