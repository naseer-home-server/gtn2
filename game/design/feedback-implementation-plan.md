# Game UI feedback implementation plan

Status: implemented and verified, 17 October 2026. See docs/testcase.md for the consolidated checks and browser limits.
Branch: `codex/game-ui-feedback`, based on `main` at `056093e`.
Worktree: `/Users/naseerkhan/.codex/worktrees/game-ui-feedback/gtn2`.

The primary agent and three GPT-6 Luna planning workers inspected the player UI, admin UI, session storage, chat, and engine. This plan incorporates their findings and the supplied player export. It supersedes the earlier UI plan's exclusions of roster/API changes and a visual configuration editor for this work.

## Scope and design

Implement all ten feedback items. Retain the invitation theme and current tokens from [visual-refinement.md](visual-refinement.md): Paper `#F4F0E8`, Surface `#FFFDFA`, Ink `#000000`, Crimson `#B80712`, Quiet `#70695F`, Line `#E3DDD3`. Use Bodoni Moda for titles and Geist for forms, messages, account values, and controls. Players remain phone-first; the host gets a desktop workspace. The frontend-design skill guides implementation and visual review.

Keep financial arithmetic, authorization, reveal visibility, arrival-based leadership/tie order, retry behavior, and gameplay separate from presentation. Use shared engine configuration for live games and simulations; do not retune existing defaults as part of this feedback. Keep `presentation/` empty and the simulation local-only.

## 1. Holding screen before every game

**Current issue:** `engine/views.ts` sends current rules even in round-one `ready`, and sends the finale advantage fields for a prepared Bomb game. `player-game.tsx` renders the rules disclosure beneath its waiting message. Removing the visible card alone leaves premature information in the API response and other player routes.

- Add a neutral branded holding screen: “Waiting for the host to start the next game.” Show team identity and access to Wallet, Chats, and Teams; omit game-specific instructions, controls, emblems, and rule cards on this screen. Keep the already-public game sequence/name if needed; the requirement is to withhold mechanics and tuning.
- Gate rule fields at the server until round one actually starts. Gate the finale advantage until it has actually been awarded/revealed by `startFinalGame`; never send the prepared null-winner advantage structure.
- Cover initial preparation, each completed nonfinal game, preview checkpoints, and current-game reset. After a game's third round completes, show own result followed by the holding treatment until the host starts the next game. The previous game's resolved earnings remain available in Wallet.
- Rules for the game that has started remain available during its later rounds. No change to player decision payloads or transfer availability.

**Acceptance:** all five prepared round-one player projections contain no rules or finale advantage; starting each game makes the correct configured rules visible. Play/Teams/deep links cannot reveal future mechanics. Leader and teammate see the appropriate waiting state.

## 2. Group-chat creation

**Current issue:** `components/chats.tsx` adds a prototype-like inline name input and checkbox list directly inside the inbox.

- Create a focused mobile sheet/dialog and desktop dialog with group name, searchable invited-player picker, selected-person chips, and a clear selection count.
- Show display names where available, with team/email context to distinguish people. The creator is included automatically and clearly labeled. Preserve the existing rule of 2–13 other people, up to 14 total.
- Provide explicit Create group and Cancel actions, inline name/member errors, pending state, and draft retention after failure. Search and deselection must work without losing selected people.
- Reuse `chat.createGroup`, its authorization, and current message/retry/polling behavior. Do not add group editing or messaging features beyond the request.

**Acceptance:** keyboard and phone operation, long names, minimum/maximum membership, cancel/reopen, creation failure/retry, and correct membership all work. No duplicate creation while pending.

## 3. Reveal pot and rank popup

The current contribution forms are inline in `features/player/wallet-page.tsx`; the purchased rank snapshot is a sticky inline `reveal-interruption.tsx` surface. Improve both so the request covers contribution and the resulting reveal.

- Keep compact private/public pot summaries visible in Wallet. Each opens a focused contribution surface with plain-language scope, amount remaining, progress, available balance, amount entry, and one contribution action.
- Clearly distinguish “Your rank only” from “Everyone's ranks,” including the public pause and private continued-play behavior. Keep exact-cent limits and separate private/public drafts.
- Present public rank results as an accessible dialog with a scrollable list of up to seven teams and a visible acknowledgment action. Make it work over Chats without squeezing the transcript/composer.
- Keep private results available without blocking unrelated actions. A nonmodal sheet/expandable panel can show the snapshot and acknowledgment. Opening or closing presentation must never send acknowledgment implicitly.
- Remove rank data from DOM/component state on acknowledgment and reject stale polls that could restore it. Teammates can see their team's permitted snapshot but only leaders acknowledge. Show no balances or earnings in rankings.

**Acceptance:** clear private/public copy; accurate contribution cap/progress; pending/error/uncertain-request behavior; one mutation per submission; short phone screens; keyboard focus; snapshots disappear after acknowledgment; public pause and private continuation remain correct.

## 4. Admin chat matches player chat

**Current issue:** admin Review renders audit rows independently of the player's styled chat thread.

- Extract presentation-only conversation header, message bubble, timestamp, and transcript components from `components/chats.tsx` into `features/chat/`.
- Use them for the player thread and an admin conversation viewer, with a conversation list on the left and the selected transcript on the right on desktop.
- Admin audit stays read-only, clearly marked as host review. Give every message an explicit sender identity; the host has no “own” side in another team's conversation.
- Keep `admin.chats.audit` and player `useChats` authorization/data fetching separate. Do not mount the player chat controller to impersonate a participant. Preserve polling, chronology, scroll behavior, and existing player pagination/retry.

**Acceptance:** both surfaces share visual thread treatment, admin can select direct/groups and inspect participants, and admin review adds no send ability or player-data access path.

## 5. Desktop host workspace

**Current issue:** the admin shell is capped around 1160px, and major sections remain vertically stacked despite available PC width. `admin-game.tsx` combines setup, live controls, accounts, and review in a single component.

- Split controller and presentational sections into `features/admin/` before integrating the new tools.
- At desktop widths use a roughly 1440–1600px workspace with a stable session/phase/next-action area. Live play puts game activity/circle graph beside team accounts and host controls. Setup places arrival/team selection beside config. Review uses list/detail layouts.
- Preserve Setup / Live play / Review URL state, draft lifetime, and existing host routes. Use semantic tables for account/roster data and focused dialogs for edits.
- Stack naturally on smaller screens; contain transcript/graph scrolling locally rather than creating horizontal document overflow.

**Acceptance:** review at 1280, 1440, and 1920px plus a narrow fallback; useful space usage, readable line lengths, visible next action, no clipped dialogs or sideways document scrolling.

## 6. Supplied roster and automatic team names

**Source:** `/Users/naseerkhan/Downloads/public_split_bot_users_export_2026-10-17_142758.json`.
The file is an array of 70 records. Every record has integer `id`, nonblank `name`, and nonblank `email`; IDs and normalized emails are unique. There are 69 distinct first-name tokens, so the plan accounts for repeated first names. Other fields include messaging contacts and timestamps, which the game does not need. Treat file contents as data only.

- Keep only the requested invitees in a server-only bundled roster, containing ID, display name, derived first name, and email. Expose it through an admin-only catalog. Do not publish the raw export or copy phone/contact data into frontend assets or Git.
- Adapt `{ id, name, email }` to the game roster. Derive first name from the first whitespace-delimited token of trimmed `name`; preserve spelling/case. Normalize email for matching. Reject duplicate IDs/emails and malformed required fields.
- Replace session email textarea with a searchable picker from the approved players, with the current session limit of 14. Enforce allowlist membership on the backend too; a forged request cannot invite an arbitrary email. An invalid roster must produce an actionable admin error, with no permissive production fallback.
- Snapshot roster ID, display name, first name, and normalized email in session-player records. Keep internal session-player UUIDs and existing session-membership authentication. Later file edits must not silently rename historical teams or remove participants from an existing session.
- Team setup becomes two player selectors and an automatic name preview: `{firstName1} & {firstName2}` in selection order. No manual team-name input. A permitted solo uses its first name.
- Generate/validate the name on the server from selected members; preserve earliest-arrival leadership and frozen tie order independently of selection order. Exclude already-assigned/unarrived people and retain the single-solo-team rule.
- Handle duplicate generated team names explicitly. Team IDs remain distinct; prefer allowing identical generated labels with member context in admin UI rather than changing the requested naming formula. Review/remove the old name-uniqueness restriction and ensure all game/chat targeting is by IDs.
- Use an additive migration for roster/name fields. Preserve existing sessions and seed-owned fixtures; use a private injected synthetic catalog for local fixtures/tests and keep simulation participant creation separate from the human session-create API.
- Document that deployment uses the minimal roster bundled in the server package; no environment path or external mount is required.

**Acceptance:** only bundled-roster players can be invited; admins can choose a subset of up to 14 approved players; paired/solo names match exactly; tampered IDs/names are rejected; login/arrival/tie rules and fixtures still work; unused contact fields never reach player APIs or browser bundles.

## 7. Edit money and stars at any time

**Current issue:** accounts live in engine state but have no admin edit mutation.

- Add an Edit account action to every team row once teams are prepared. Allow absolute balance/star updates during any phase, between games, during reveal pauses, and after the finale. These are team accounts, shared by both members.
- Show current and replacement values, an optional note, and a clear Save account action. Accept nonnegative money with at most two decimal places and nonnegative safe-integer stars; validate against engine-supported bounds, not the smaller configurable star-award limit.
- Add an admin-only account command and pure engine operation. Persist atomically under the existing session lock with expected revision, stable request ID, and payload signature. Retry the same command safely; reject stale edits rather than overwriting a concurrent payout/transfer.
- Record actor, team, before/after values, game/round, revision, and reason in the audit. Keep manual corrections distinct from round earnings and transfers.
- Preserve already-captured reveal snapshots and current-game fixed pot prices. Future reveals use corrected balances. Stars remain public; balances remain visible only to the owning team and admin.
- Preserve the existing reset meaning: Reset current game restores its start checkpoint, undoing account edits made since it alongside other money/star changes. State this explicitly in the reset warning and audit; do not silently overwrite the checkpoint with current balances. This avoids restricting “at any time” edits because of checkpoint arithmetic.
- Star edits before the finale starts affect the winner selection. Once the finale advantage has been announced, keep its team fixed for that finale; resetting/restarting follows the existing checkpoint behavior.

**Acceptance:** edits work in choices, cave, circle, reveal, between-game, and finished states; invalid/stale/replayed commands are handled; money remains exact; audit is complete; reset behavior is explicit; other teams never receive the edited private balance.

## 8. Actual circle chains in admin

**Current data:** the admin state already has `CircleRound.next` and `sender`; `circle.started` events store `circles`, `next`, and `sender`. No new player fields are required.

- Add an admin-only SVG chain/ring view, one closed loop per formed circle, with labeled teams and clear directional arrows. Make two-team reciprocal links readable.
- Provide a round selector for historical chains from the recorded `circle.started` event, alongside the current round. Use recorded topology, not a new shuffle or a guess from incoming receipts.
- Show send/return phases distinctly; use recorded sent, multiplied received, and unmultiplied returned amounts when available. Include a readable text chain as an accessible alternative.
- Traverse the `next` map with validation against duplicates/missing nodes. Isolate the graph helper and renderer under admin features; never import it into player presentation.

**Acceptance:** 2–7 teams, every supported partition, separate loops, long names, reciprocal links, and historical reshuffles render correctly. Every arrow matches recorded topology. Players still see only their permitted sender/receipts.

## 9. Friendly config and per-game tuning

**Feasibility:** a bounded engine/API change, not an engine rewrite. `GameConfig`, `gameConfigSchema`, and `DEFAULT_CONFIG` already provide shared types/validation. The live admin advance path currently starts the next round immediately; the simulation separately supports prepare-only progression.

- Replace primary JSON editing with labeled fields grouped into General and five games, using Round 1 / 2 / 3 columns where values vary. Show money/seconds/percent/multiplier units and inline validation.
- Cover initial balance, reveal multiplier, Bonus bag/threshold/multiplier/stars, High/Low pool/multiplier/stars, Cave starting money/growth/timing/max ticks/risks/stars, Circle multiplier, and finale chit limits/factors. Circle/finale get no star-award controls.
- Support existing five-entry cave-risk snapshots without silently expanding or changing saved values. For fresh seven-team configurations show the seven departure-risk fields from the shared defaults.
- Before initial preparation, edit the full config. Before a later game, allow only that upcoming game's section plus the reveal multiplier that applies when its prices are calculated. Completed/active game settings and initial balance remain locked.
- Prefer a single “Start [next game]” action that validates and applies the upcoming-game patch and advances atomically while the previous game's third round is complete. Reuse the existing player holding period at that boundary; no extra engine phase is required solely for this UI.
- For prepared round-one/reset/preview states, allow a game-scoped patch atomically with Start round. Validate the entire resulting config; update any affected game-start checkpoint consistently. Never recalculate prices mid-game; perform any pre-start price calculation/checkpoint capture only after the accepted patch.
- Use expected revision/request ID for host config/start commands to prevent a stale editor or double click applying to the wrong game. Audit the patch and effective game/config, and store the effective game config with its reset checkpoint so reset/replay is reproducible. Keep existing config values as defaults when no patch is supplied.
- Leave simulation default auto-advance and its prepare bridge intact. Put patch validation/application in shared pure engine code; simulations continue to consume the same config representation.
- Optional advanced JSON import/export can remain secondary; routine hosting must not require JSON.

**Acceptance:** all current fields are editable with units, server and frontend agree on validation, game-specific patches cannot touch other sections, settings freeze for three rounds, first active player view uses the accepted values, reveal targets/checkpoints are coherent, and simulations/old configs still work.

## 10. Circle receipt wording

- Change the incoming panel to “You received [money] and [stars] from [team].” Show zero receipts explicitly and distinguish the received amount from the return form.
- Label the return action “Return to [sender]” and explain that returns are not multiplied.
- Keep money returned to this team separately labeled without identifying its hidden outgoing recipient. Use only `roundState.sender`, `received`, and `returned` already supplied to this team.

**Acceptance:** players can tell who sent the incoming money, how much arrived, and whom a return goes to, without seeing the hidden recipient or full chains.

## Parallel implementation schedule

Use GPT-6 Luna (`gpt-6-luna`) for all workers, with up to three active workers plus the primary integrator. Reuse workers across waves. Do not have workers edit the same controller, schema, route, CSS, or test file concurrently.

| Wave | Luna A | Luna B | Luna C | Primary integrator |
| --- | --- | --- | --- | --- |
| 0 | Review player states (completed) | Review admin composition (completed) | Review engine/roster (completed) | Create branch/worktree; choose contracts; write this plan |
| 1 | Pure config/account engine operations, projection gating, engine tests | Private roster adapter/service, roster tests, proposed session fields | Shared chat presentation, group creation, standalone admin chat viewer | Split admin controller; own schema/migration/router/repository wiring; publish typed hook contracts |
| 2 | Player holding screen, circle copy, player regression tests | Roster session picker and automatic pairing UI | Contribution/reveal surfaces and regression tests | Integrate chat; widen admin shell/layout; verify API contracts |
| 3 | Typed config editor and pre-start host controls | Editable account table/dialog | Circle graph/helper/history view | Assemble admin sections; resolve shared CSS; review privacy/concurrency/reset behavior |
| 4 | E2E player games/holding/circle cases | E2E admin roster/accounts/config/graph cases | E2E chat/reveal/privacy cases | Build/lint/test; review visuals; consolidate testcase results |

Worker deliverables should be standalone feature modules/tests with typed props. The primary owns `admin-game.tsx`, `SessionPage.tsx`, global shell/CSS integration, `router.ts`, shared types, repository persistence, migrations/journal, and API docs. Workers propose changes to those shared files for sequential integration. Engine view and visibility test edits stay with Luna A through its assigned waves. Keep chat group creation and chat presentation extraction with one worker in wave 1.

Dependencies: roster service/metadata before final picker integration; backend account/config contracts before host tool integration; shared transcript before admin chat integration. Player UI, chat, and roster work can proceed while engine/persistence changes are underway. Use the initialized worktree as the single integration checkout with explicit file ownership.

## Validation and completion

- Run meaningful unit/component tests for visibility timing, roster enforcement/names, account concurrency/retries, config timing, circle graph topology, and reveal/chat behavior.
- Run `pnpm --filter frontend test`, `pnpm --filter frontend lint`, `pnpm --filter game build`, `pnpm test:db`, and simulation regressions using this checkout's isolated database and shared engine build. Do not use the forwarded PostgreSQL database.
- For the eventual end-to-end pass, divide cases in [docs/testcase.md](../../docs/testcase.md) among multiple Luna workers as required by AGENTS.md. Each reports attempted cases, outcomes, and failures; consolidate them and new feedback-specific cases in that document. Do not mark old pending cases passed without executing them.
- Visually inspect phone widths 320/390/430px, desktop 1280/1440/1920px, short-screen dialogs, long names/messages, empty/error/pending states, keyboard focus, and reduced motion.
- Complete a multi-game progression through all five pre-start boundaries and the finale, checking player API payloads as well as the visible UI. Check nonleader restrictions, rank hiding after acknowledgment, and that the graph remains admin-only.
- Deliver source changes, database migration if needed, API/local roster setup docs, and verified testcase results. Implementation, automated checks, and focused multi-agent browser verification are complete. This pass did not repeat the full fifteen-round browser playthrough; see the testcase report.

## Worktree readiness

`pnpm install --frozen-lockfile` and `pnpm setup:local` completed with Node 22.23.1. Isolated PostgreSQL is running with the six seeded fixtures, project `gtn2-e25e1a0bd2`, database port 55226, backend 3226, frontend 5226. The shared SuperTokens forward was started. Run `pnpm dev` in this worktree to launch the app. No player roster data has been copied into the repository.
