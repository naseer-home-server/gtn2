# Browser test cases

Manual browser end-to-end coverage recorded on 2026-10-11; this checklist was updated on 2026-10-14 for features merged since then. Three fixtures completed all 15 rounds (45 rounds total). The [full report](e2e-browser-report.md) includes final balances, evidence, and the two privacy bugs found under the earlier realtime pot-pricing rule. Those observations are historical; the current regression cases are listed below.

## Local fixtures

Run `pnpm setup:local` in each worktree to create its isolated PostgreSQL database and test sessions. **E2E Playthrough** has ten invited people assigned to five pairs and waits at game 1, round 1 for a complete 15-round browser run. Five **UX Preview** sessions each contain three people in a pair and a solo team, and wait at the start of their respective games for focused player/admin checks. Activate the desired session and start its prepared round. [Local development and test fixtures](local-development.md) lists player accounts, ports, seeding, and reset commands.

## Local setup verification — 2026-10-14

- `pnpm test:db`: 65 passed, zero failures, zero skipped, using this worktree's Docker PostgreSQL. Includes the 15-round gameplay persistence test, transfers, chat, and fixture seeding/reset. The gameplay database test was corrected to derive actual team leaders and reject nonleader actions/retries.
- `pnpm test:local`: two passed, covering distinct Compose projects for checkouts with the same basename, auth inheritance, repeat setup, and occupied-port/production rejection.
- `pnpm build`: frontend and backend passed.
- Database stop/start and repeat setup preserved all six fixture IDs and created zero duplicate sessions.
- Browser smoke passed: admin lists all six fixtures; E2E leader logs in at Bonus round 1; Circle preview activation/start shows useful funds, public stars, and the leader's game controls; current-game reset restores its ready checkpoint. E2E is active afterward, and all UX checkpoints are ready at round 1.

This run covers local setup and the browser smoke above. A fresh run of the full browser checklist remains pending; historical checkmarks below retain their recorded coverage.

## Setup and access

### Seven-team transition — browser checks pending

- [ ] Create a session with fourteen invitees, mark all arrivals, reorder all fourteen, assign seven pairs, and start play; also cover six pairs plus one solo team with thirteen attendees.
- [ ] Reject a fifteenth invitee, an eighth team, duplicate membership, more than two members per team, and two solo teams.
- [ ] Complete all fifteen rounds with seven teams; verify public ranking reveals wait for all seven acknowledgments and own information stays private.
- [ ] Transfer money to all six other teams, including six custom allocations and uneven cent splitting.
- [ ] Open a group with thirteen other people and verify all fourteen members can use it.
- [ ] In the simulation form choose six/seven teams, edit all seven cave risks, and check host/player rules, account display, cost totals, and pause/resume.
- [ ] Confirm each six-/seven-team circle grouping can occur and the UI never exposes the outgoing recipient or other circles.
- [ ] Import a five-entry cave risk configuration and resume an older five-team run without altering its stored risk table.

### Previously recorded setup checks

- [x] With **UX Preview — cave** active, log in with an invited player account and verify the player view opens the matching game.
- [x] Create a session with nine invitees; mark arrivals, reorder them, then restore and freeze the arrival order.
- [x] Assign four pairs and one solo team; start with valid configuration.
- [x] Reject malformed configuration, `tickSeconds: 0`, duplicate emails differing by case, and an eleventh invite.
- [x] Reject an outsider and a player invited only to an inactive session.
- [x] Deny a player access to the admin route.
- [x] Disable email test login: hide passwordless login and deny the existing test login. Re-enable it and restore access.
- [x] Verify both teammates see the team's submitted choice and the first submission locks the team choice.
- [x] Verify the earlier-arriving teammate is identified as team leader, a nonleader sees the leader-only explanation and no Cave decision controls, and the leader sees the Stay/Leave controls.
- [ ] Verify nonleader game actions, transfers, reveal contributions, and acknowledgments are rejected by the server; both teammates can still see the team's permitted view.
- [x] Reload a player page and verify balance and game state persist.

## Team money transfers

- [ ] Split a transfer equally among multiple recipients; verify leftover cents follow frozen team arrival order, and verify a custom allocation debits and credits the exact shares.
- [ ] Verify transfers are available while a round is ready, after the sender has submitted a choice, and between rounds; the game phase, choice, and state token stay unchanged.
- [ ] Verify only the sender and recipients see each receipt, including for nonleaders; unrelated teams see no transfer details.
- [ ] Reject zero or negative totals, overspending, self/duplicate/unknown recipients, too many recipients, and allocations that do not exactly match the total; verify rejected transfers change no balances.
- [ ] Verify transfers are unavailable during a public ranking reveal and become available after all teams acknowledge; a private reveal does not block other teams' transfers.
- [ ] Retry a committed transfer with the same request ID and verify it is applied only once.

## Player chat

- [x] Open a direct conversation from both teams and verify it reuses the same thread and message history.
- [x] Create a group conversation and send messages as its creator and as a nonleader member.
- [ ] Verify only selected group members can read or send messages; verify a new reply appears through polling.
- [ ] Load an older page of messages and verify messages remain in chronological order.
- [ ] Verify the inbox lists invited players and team membership without exposing balances, ranks, earnings, or private gameplay state.
- [ ] Verify chat remains available independently of gameplay progress and that conversations/messages persist for the session lifetime.

## Shared rules and reveal pots

- [ ] Verify teams see their own balance, public team names and stars, but no rank before a paid reveal.
- [ ] Verify public and private pot prices start at 100 and 20, stay fixed during game 1, then recalculate only at the start of games 2–5: public = median current balance ÷ 3 × configured multiplier, rounded to the nearest 100 (halfway up; minimum 100 for positive combined balances); for an even team count, use the mean of the two middle balances. Private = public ÷ 5. Verify past pot spending is not added back.
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

## Latest run: 2026-10-14

The browser pass used the active **UX Preview — cave** session. Invited player login, private balance/rank presentation, leader and nonleader Cave controls, direct-chat reuse between teams, and group-chat creation and messages passed. The Cave round auto-completed during inspection and was reset to round 1 ready; the Cave session remains active. Chat is session-lifetime data, so these smoke-test messages remain in that preview session: `E2E smoke check — direct chat`, `E2E smoke reply from Team 2`, `E2E smoke group`, `E2E smoke check — group chat`, and `E2E smoke check — nonleader chat`.

Supplementary backend checks run in parallel: chat tests had 3 passed and 1 PostgreSQL test skipped; money-transfer tests had 8 passed and 1 PostgreSQL test skipped. The full backend suite had 58 passed, 2 failed, and 4 PostgreSQL tests skipped. The failures are in `engine/visibility.test.ts`: the rank-privacy assertion rejects the visible private-pot target value `20.00`, and the duplicate-acknowledgment assertion expects “already acknowledged” while the engine returns “There is no rankings reveal to acknowledge.” The database tests were skipped because `RUN_DB_TESTS=1` and `DATABASE_URL` were not configured. The environment runs Node 22.6.0, below the project's required 22.12.0 minimum.

## AI simulation implementation verification: 2026-10-14

The simulation implementation used three GPT-6 Luna workstreams for backend APIs, orchestration, and web UI. See [the verification report](ai-simulation-verification.md) for API/full-night evidence and testing limits. Existing entries above are retained as historical game-app results.

- [x] Configure every shared game tuning area and capture the submitted configuration in a run.
- [x] Complete all 15 rounds through the actual backend with scripted agents.
- [x] Complete all 15 rounds through the Chat Completions adapter using a local provider stub.
- [x] Exercise host discussion caps, private chat, side operations, public rank reveal acknowledgment, virtual cave windows, circle return, and finale completion.
- [x] Reject overlapping active simulation runs and unauthenticated/cross-origin operator requests.
- [x] Retry an action whose successful response was deliberately dropped after commit, without applying it twice.
- [x] Filter public/team detail and exports on the server; omit runner/player credentials.
- [x] Verify operator login, config editing/reset/range validation/export, and pause/step/resume/stop in the browser.
- [x] Restart the built server with an interrupted run; verify paused recovery, original configuration/history, step/resume/stop, and cached older team views.
- [x] Recover initial setup after backend creation commits before its response is saved; reuse the session, team IDs, and setup request without duplicate creation events.
- [x] Verify built production team views hide observer metrics and have distinct permitted histories.
- [x] Import valid configuration through paste JSON, reject invalid collapse risk while retaining the previous configuration, reset, and export.
- [x] Build both web apps and the runner, run simulation/backend suites, validate Compose, and verify production dependency packaging.
- [ ] Real OpenAI provider run with an operator-supplied API key.
- [ ] Docker container image build/run (local daemon unavailable).
- [ ] Native file-picker import and narrow-viewport visual checks (browser-control limitations; further results may follow).


## UI refactor review: 2026-10-16

Run in the isolated `codex/game-ui-refactor` worktree using its own seeded database and app on port 5966. These are targeted UI checks; the historical full-night results above were not rerun.

Browser work was divided between the primary agent, a GPT-6 Luna player/chat agent, and a GPT-6 Luna admin agent. A separate Luna regression agent added focused frontend tests.

- Primary agent: reviewed actual player screens at 320, 375, and 430px, plus the desktop/phone admin. No horizontal document overflow remained after correcting the narrow viewport body width. Checked the five game forms, ready states, long Circle title, nonleader restrictions, negative/over-limit money, excessive stars, and finale empty/fractional/over-limit piles. Valid finale direction and recipient totals can differ; draft survives Wallet navigation.
- Primary agent: High or Low amount draft survived navigation and reveal actions. A private reveal showed only the team's rank on Teams; a public reveal appeared on Chats with all ranks. Acknowledgment hid ranks while the pending public acknowledgment kept play paused. A local test transfer succeeded with its receipt and balance change.
- Primary agent: started Cave, accepted Stay, and verified the deadline countdown remained visible on Chats. Checked host activation, arrivals/reordering, team setup drafts across sections, invalid configuration feedback, prepared round start, reset, and Setup/Live play/Review navigation.
- Player/chat agent: checked the E2E team player view, disabled transfer with zero balance, team privacy, admin denial, direct/group conversation creation, chat draft retention across routes, visible keyboard focus, Bonus limits, amount draft retention, and a submitted Bonus choice. No chat messages were sent. Its Chrome surface did not support viewport overrides; the primary agent performed the exact-width checks separately.
- Admin agent: attempted host cases in Chrome but inherited a player login and correctly saw admin access denied. Host behavior was verified by the primary agent in the authenticated in-app browser instead.
- Automated frontend regression: 7 tests passed, covering transfer drafts and exact uncertain retries across navigation/query failure, round draft lifetime and identity isolation, chat draft/retry lifetime, and rejection of a delayed poll that could otherwise restore an acknowledged rank reveal. Game production build and TypeScript checks passed. Frontend lint has two existing Fast Refresh export warnings in the button and badge primitives. Vite still reports a JavaScript chunk over 500kB.

Limits: this pass did not repeat all 15 rounds, external Google OAuth, statistical draw checks, real device keyboard/safe-area behavior, screen-reader testing, 200% zoom, or a browser-level dropped-response retry. The latter retry paths have focused component coverage. Visual review remains subject to user feedback.

The local E2E fixture contains the submitted Team 5 Bonus choice and the created empty chat conversations. The extra `UI Refactor Admin Check` session is a setup test fixture. Preview sessions were restored to their prepared round checkpoints after destructive gameplay checks where recorded; the final active review fixture is UX Preview High or Low, round 1 started with no player choices submitted. Cave is restored to round 1 ready. Phone evidence is saved in `game/design/review/`.


### Additional visual refinement: 2026-10-16

Following user feedback, the game frontend received a second visual-system revision: compact branding, game-specific vector marks and a five-game progress track, consistent contained forms, quieter metadata, an account-style wallet, a grouped team roster, aligned chat layouts, and refined host working surfaces. The current design notes are in `game/design/visual-refinement.md`.

The primary agent reviewed Play/Wallet at 320px (305px document content with desktop scrollbar), player Play/Wallet/reveal forms/Teams/Chats/thread at 390px, Play at 430px, and the host desk at 1280px. Narrow Play/Wallet and wide Play had no horizontal document overflow. Small helper text and chat alignment were corrected during review. Separate Luna agents implemented scoped admin and chat presentation; browser review was performed by the primary agent. This was a visual review, not a new full gameplay end-to-end run. No game decisions, transfers, reveal contributions, session activation, or chat messages were submitted during this additional pass.

All 7 frontend regression tests, frontend TypeScript/production build, and lint completed after the final changes. The two Fast Refresh export warnings and Vite's large-chunk warning remain. The combined game build also passed during this revision. Final screenshots: `game/design/review/refined-play-390.jpg` and `game/design/review/refined-wallet-390.jpg`. The High or Low review fixture remains active with its existing state.


## Play balance and unread chat follow-up: 2026-10-17

- Play shows the signed-in team's private balance in a compact account row, links it to Wallet, updates it from game state, and retains it after the finale. Browser review used the currently active Gamble Bomb checkpoint at 390px and 320px; the narrow document had no horizontal overflow. No game actions or chat messages were submitted.
- Unread dots appear on Chats navigation, the inbox heading, and affected conversation rows. The existing two-second inbox poll supplies the latest incoming sequence in each membership-filtered conversation. Browser-local read positions are scoped to session/player and contain no message text or account information. Only incoming messages displayed at the bottom of an open, visible conversation advance the marker; opening the inbox, a background tab, or a newer own reply does not clear unseen incoming messages. Read positions persist across refresh and synchronize between tabs on the same origin; they do not synchronize across devices/teammates. No database migration or new dependencies.
- Frontend: all 16 tests passed, including read persistence/isolation, storage fallback and cross-tab updates, unread lifecycle through navigation and background visibility, concurrent own replies, and Play balance updates/final state. A Luna regression agent contributed the six unread-hook tests; the primary agent added integration coverage.
- Backend: `pnpm test:db` passed all 70 tests, with no skips, against this worktree's local database. This includes notification metadata for recipients, exclusion of own messages, and preservation of the incoming sequence when a newer own message exists. Combined game build and final frontend build passed. Lint retains the same two Fast Refresh warnings; Vite retains the large-chunk warning.
- Browser-level unread arrival/clear was covered by component integration rather than sending messages into the user's active fixture. Evidence: `game/design/review/play-balance-390.jpg`. The shared SuperTokens forward stopped during inspection and was restored with the documented `scripts/pf-anton`; the preview recovered.


## UI merge integration: 2026-10-17

- Merged the game UI refactor with main's seven-team support, fourteen-player invitations/group chats, and configured cave tick limit. Carried the cave tick count, automatic banking explanation, and maximum-ticks setting into the refactored player screens.
- Preserved main's engine tuning and simulation changes. Updated the stale seven-team cave test to use the configured departure risks and cover the guaranteed-collapse value.
- Validation: game frontend/backend build passed; all 17 frontend tests passed, including the cave merge regression; all 81 backend/database tests passed with no skips using main's isolated local PostgreSQL. Frontend lint has only the existing two Fast Refresh warnings; Vite retains its existing large-chunk warning. No browser end-to-end run was performed for this merge.
