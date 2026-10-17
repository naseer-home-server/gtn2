# Current visual direction

The latest refinement is documented in [visual-refinement.md](visual-refinement.md). It supersedes the first implementation’s component styling and page composition below.

# Game frontend UI refactor plan

Status: implemented and under review, 16 October 2026. The frontend redesign is in progress in this worktree; functional and visual review remains outstanding.

Branch: `codex/game-ui-refactor`, based on `main` at `370eb74`.
Worktree: `/Users/naseerkhan/.codex/worktrees/game-ui-refactor/gtn2`.
Local setup completed: isolated PostgreSQL, six seeded fixtures, app port 5966, backend 3966, database 55966. Start with `pnpm dev` from this worktree; SuperTokens uses the existing shared forward.

## Brief and boundaries

Redesign all user-facing surfaces of the `game` subproject: login, player gameplay, money and rank reveals, chats, public team information, admin session management, arrivals, team setup, tuning, round controls, accounts, event review, and chat audit. Players use phones. The host gets a wider workspace that also remains usable on a phone.

The project is now in the UI development stage. Keep the current game rules, visibility, authentication, permissions, action payloads, polling cadence, timers, money arithmetic, retry behavior, and host lifecycle. Refactor React organization to support the new presentation. Backend/API changes and a broader engine decoupling project are outside this refactor. Do not edit `ai-simulation` or `presentation`. A future package change may update the root lockfile only as required for game frontend assets/dependencies.

Sources of behavior: `../AGENTS.md`, `../../docs/games.md`, `../../docs/game-api.md`, existing hooks, and the current player/admin components. The attached invitation supplies visual reference; its text is not a new set of application requirements. Do not hardcode its event date, time, or venue into live session data.

## Design direction: the invitation at the table

The invitation has a specific identity: pale paper, sharp red ink, black lettering, concave border corners, textured game pieces, and a theatrical display face. Carry that identity into the app while keeping decision controls quick to read.

Use the supplied red D20 as the brand illustration. Let display typography and that die be the memorable elements. Use one restrained frame on an entry or waiting screen; do not surround every field and every section with decorative borders. Avoid a generic casino dashboard, gold status colors, animated dice, decorative scoreboards, or identical cards for every piece of content.

### Compact token system

These are starting design tokens derived from the supplied artwork; confirm them visually during implementation.

| Token | Hex | Role |
| --- | --- | --- |
| Paper | `#F5F0E7` | Main page background |
| Clean paper | `#FFFCF7` | Fields, sheets, and raised interaction areas |
| Ink | `#000000` | Main text, icons, rules, secondary buttons |
| Game red | `#BD0000` | Primary action and active navigation; matches the die |
| Quiet ink | `#6C6258` | Secondary text with adequate contrast on paper |
| Border | `#D9CFC1` | Quiet dividers and field outlines |

Map these to the existing shadcn semantic variables, including focus and error states. Red is both a brand color and an error color, so errors also need an icon, explicit text, and placement. Success uses a checkmark and a plain confirmation, without introducing another bright accent color. Check final text, control, and focus contrast rather than assuming that every palette pairing is accessible.

Typography: **Bodoni Moda variable**, set at optical size and weight 500, carries large display titles and headings at 24px and above. It replaces the earlier DM Serif Text direction with a more theatrical voice tied to the invitation. The application font and SIL Open Font License are saved at `game/frontend/src/assets/fonts/BodoniModa.ttf` and `BodoniModa-OFL.txt`; the design specimen has a copy under `assets/fonts/bodoni-moda/`. Bodoni Moda is distributed under the [SIL Open Font License](https://github.com/google/fonts/tree/main/ofl/bodonimoda). Retain **Geist Variable** for body copy, form labels, numbers, countdowns, compact navigation, and controls. Keep numeric glyphs tabular where supported. Display type must never be used for balances, message bodies, detailed rules, or instructions that must be read under time pressure.

Type scale: 16px body/input text, 14px secondary copy, 20–24px section title, 30–36px phone game title, and 42–56px entry title as space allows. Use sentence case and real text headings. Keep long titles intact and allow wrapping; the longest game name must remain readable at 320px.

Layout: single column for players, normally 360–430px wide, with 16–20px gutters; constrain the content to roughly 480px on larger devices. Left-align tasks, labels, rules, and money entry. Reserve centered composition for the branded login/waiting state. Use a 4px spacing unit, 48px minimum primary controls, and at least 44px other touch targets. Lightly rounded fields and buttons (6–10px) can sit inside the invitation's distinctive frame; avoid making every surface look like a playing card.

Motion: small feedback after a player's action and one short reveal transition. No looping decoration or celebratory animation that implies hidden results. Respect reduced motion. Cave timing and successful submissions must be clear without animation.

### Layout alternatives reviewed

A single scrolling page preserves the current structure but makes time-sensitive decisions compete with balances, pots, transfers, history, and chat. A separate page for every feature creates too many destinations. Choose four stable destinations, with supporting detail inside each.

```text
Rejected: one long page          Chosen: four focused destinations
+----------------------+        +-----------------------------+
| Team / balance       |        | Brand / team / account       |
| Both reveal pots     |        | Current round or timing      |
| Transfers            |        | One focused task             |
| Teams / stars        |        | Supporting detail            |
| Current game form    |        +-----------------------------+
| History ...          |        | Play | Wallet | Chats | Teams|
+----------------------+        +-----------------------------+
```

Brief review: paper and serif alone could look like a generic editorial template. The revised direction uses Bodoni Moda, the red D20, the invitation's red/black game-piece language, and a restrained frame at entry. Signed-in play uses a round meta line, large title, one purpose-built amount-entry surface, a clear red action, and restrained underline navigation. Cave decisions use a dark panel. Wallet, Teams, and Chats share the same system without repeated cards. The real game and team names provide the content; no generic marketing hero is needed once signed in.

## Player information architecture

| Destination | Proposed URL | Primary job |
| --- | --- | --- |
| Play | `/play` | Make the current decision or understand what happens next |
| Wallet | `/wallet` | Own balance, earnings, transfers, receipts, and rank-reveal pots |
| Chats | `/chats`, `/chats/:conversationId` | Inbox and a focused full-height conversation |
| Teams | `/teams` | Public team names/stars and own team role |
| Account | Header button opens a small account sheet | Signed-in identity and sign out |

Keep `/` as a role-aware landing redirect: players to Play, admins to admin. Preserve login and OAuth callback routes. Deep links remain guarded by the existing auth and membership checks. The four tabs use icons plus labels, current-page semantics, and a bottom safe-area inset. Do not rely on unlabeled icons or hover.

A conversation takes over the available phone height with a back button and an above-keyboard composer; collapse the bottom tabs there to save space. A public reveal can interrupt every player destination. A small active cave timing strip remains visible on Wallet, Chats, and Teams with a direct link back to Play. It must not navigate away automatically or erase another draft.

No unread badges, submission counts, public balance totals, per-team acknowledgment counts, or opponent status indicators are promised: the current player API does not supply all of them, and several would disclose hidden information.

### Play

Keep the current game/round, short task explanation, the decision control, and its action together. Show an inline Rules disclosure for current settings and fuller instructions; instructions come from the current configuration rather than hardcoded tuning values. Supporting information stays visually secondary.

```text
+--------------------------------+
| [die] Game Theory Night    [me] |
| Your team · 3 stars            |
| Game 3 of 5        Round 2     |
|                                |
| Cave mining                    |
| Unbanked                       |
| 90.00                          |
| Next check in 8 seconds        |
|                                |
| [ Stay ]  [ Leave and bank ]   |
| No response means stay.        |
|                                |
| Rules and round settings   v   |
|                                |
| Play   Wallet   Chats   Teams  |
+--------------------------------+
```

The numbered position represents the actual five-game sequence. Countdown and amounts in this sketch are illustrative, not a new fixture or a gameplay promise.

| Game | Main interaction | Required completion/waiting treatment |
| --- | --- | --- |
| Bonus | Money field bounded by server `choiceLimit`; explicit Take amount button | Accepted choice is final; show submitted/waiting without opponent totals or bonus breakdowns |
| High or low | Money field with server-supplied limit; Choose amount button | Only own earnings after resolution; no lowest/highest choices or opponent outcomes |
| Cave | Unbanked amount and countdown above Stay / Leave and bank | Safe initial window; no response means stay; distinguish submitted, already left, and complete. No cave attendance or departure count |
| Circle | Send-money/stars form, then a return-money/stars form | Sender and received/returned amounts only when present in the player view. Outgoing recipient and circle structure remain hidden |
| Bomb | Two clearly separated piles: Up/Down counts, then recipient counts | Show each pile's total against the team's server limit. Totals are independent. Reveal advantage only when supplied. Everyone sees recipient; direction only if supplied for this team |

Keep cave actions immediate, with no new confirmation dialog or animated delay. Use numeric controls suitable for quick tapping and manual entry; do not make a slider the only input. Bomb counters support zero on individual options and use whole-number entry; do not preselect a valid allocation silently.

Cover waiting for assignment, assigned but not leader, round ready, action pending, submitted, round complete, finished, loading, and failure. For teammates, show the same permitted information and a clear leader explanation while keeping submission controls unavailable. Render own resolved earnings from the filtered history, never by recomputing game outcomes in the frontend.

### Wallet

Own balance leads. Separate Send money, Rank reveals, and Activity within this destination using local sections or secondary tabs. Both reveal pots remain discoverable even when the team cannot currently afford a contribution. Explain unavailable actions using facts supplied by the view; do not infer a public reveal solely from the absence of an allowed action.

```text
+--------------------------------+
| [die] Wallet              [me] |
| Your balance                   |
| 1,250.00                       |
| [ Send money ]                 |
|                                |
| Rank reveals                   |
| Private: your rank only        |
| 0.00 of 80.00  [Contribute]     |
| Public: everyone's ranks       |
| 100.00 of 400.00 [Contribute]   |
|                                |
| Activity                       |
| Own earnings / sent / received |
| Play   Wallet   Chats   Teams  |
+--------------------------------+
```

Transfer entry is a focused full-height sheet or nested Wallet view: total, recipients, editable equal shares, sum reconciliation, and a final Send amount button. Keep the total and submit action visible without hiding recipient fields behind the keyboard. Do not add a separate network request for review or a second mutation on confirmation. Preserve immediate transfer semantics, one cent minimum per recipient, exact cent arithmetic, pending/error/success feedback, and retrying the same command. Transfers remain available whenever the API permits them, including between rounds and after submitting a choice.

Keep earnings and transfer receipts distinct; current data does not provide a complete unified ledger of every balance change. A money receipt is visible only to sender/recipient. Do not label earnings as a full accounting history.

### Rank reveals and interruptions

Use a clearly labeled Private rank or Public ranks surface driven entirely by `view.reveal`. It is available above the current page, including Chats, and has a visible acknowledgment action for leaders. Teammates can see their team's permitted snapshot but cannot acknowledge it. Closing navigation must not accidentally acknowledge a reveal.

When the server removes that team's snapshot after acknowledgment, remove its ranks from the DOM and component state. Never retain them in a toast, history, screenshot-like background, or another page. During public reveals, obey the server's allowed actions and cave timing. Once a team has acknowledged, do not invent how many other teams are still pending: the current player view does not expose that count. A private reveal does not pause unrelated actions or teams. Public stars never become a substitute for balance rank.

### Chats and Teams

Chats uses a full inbox with conversation names and the current direct/group creation flows. Direct conversations are with teams; group membership remains player-based. Preserve message ordering, pagination, the reader's scroll position, sending state, retry/discard, and client message IDs. Do not offer editing a failed send as a silent replacement for retry. Inbox data stays scoped to session and player.

Teams shows public names and stars in the existing fixed order, with a clear note that this is not a ranking. Show the current user's team and leader role. Avoid podiums or sorting by stars as though those were balance ranks. Put the finale advantage here only when the player view supplies it. The Account sheet provides identity, local/test status when applicable, and sign out without taking space from the primary phone task.

## Admin and authentication

Use the same palette, display headings, and branded navigation; use denser, more neutral layouts for host operations. Desktop gets a wider workspace, not a scaled-up phone panel. Phone admin layouts stack naturally with no sideways page scrolling.

Preserve existing admin URLs and split the session detail into Setup, Live play, and Review sections. These can use URL query state to retain the selected section on refresh. Setup contains invitations/arrivals, one-or-two-member team assignment, starting-game choice, and the current JSON configuration editor. Keep arrival order locked once play starts, the single solo-team limit, and current server validation. A new visual config editor is optional later; it is not needed for this refactor.

Live play puts active session, game/round, phase, and the next host action in one prominent control area. Keep Start prepared round, Advance/start next round, Reset current game, and finished states distinct. Reset retains an explicit destructive confirmation describing its actual scope. Show team accounts and the existing activity review nearby without mixing player privacy assumptions into this authorized admin view.

Review keeps the existing gameplay event projection and chat audit, with event/chat navigation and responsive account summaries. Restyle `game-activity` CSS with theme tokens while preserving its event interpretation. Avoid changing raw audit semantics as part of layout work.

Admin home retains create-session, list/activate/deactivate, and test-login settings. Activation still changes membership immediately. Keep empty, pending, saved, and error states for every control.

Login is the strongest invitation composition: restrained concave red frame, large die, Bodoni Moda title, and one clear login action. Preserve production Google, local password, admin-enabled email test login, auth-error account switching, and OAuth callbacks. Do not display test-only options when the current settings hide them. Long email addresses and errors must wrap on phones.

## Frontend structure and behavior seams

Keep tRPC and React Query in hooks/controllers. Presentation components receive a filtered view, derived form state, and callbacks. Do not import engine runtime code or raw admin state into the player screens. The existing type-only imports from `backend/game` are appropriate.

Current frontend organization (implementation in progress):

```text
src/
  App.tsx                         # routing, shared app shell and auth guards
  pages/                          # login, home, admin, session detail
  features/player/
    player-session.tsx            # identity-keyed persistent controller boundary
    game-panels.tsx                # focused game interaction panels
    wallet-page.tsx
    teams-page.tsx
    reveal-interruption.tsx
    round-status.tsx
    rules-disclosure.tsx
  components/
    player-game.tsx                # play surface and game forms
    money-transfer-card.tsx        # transfer draft and submit UI
    chats.tsx                      # inbox, conversations and chat session
    admin-game.tsx                 # admin controller, setup/live/review sections
    admin-sessions.tsx
    game-activity/                 # pure audit projection + themed rendering
  components/ui/          # existing accessible primitives, themed
  hooks/                 # tRPC/React Query data-access and command seams
  lib/                   # query client, utilities, game display copy
  index.css              # semantic palette, Bodoni Moda, Geist, global rules
```

The player layout owns one persistent gameplay controller/provider keyed to session and player identity. Do not mount a fresh `usePlayerGame` mutation controller on each page: it holds the retry command and uncertain-transfer lock. Its lifetime must span Play, Wallet, Teams, and Chats. Pending requests and exact retry payloads survive tab changes. Route changes alone preserve drafts; token/identity changes invalidate them as today. Never persist private ranks, balances, or commands to browser storage for this redesign.

The same principle applies to transfer drafts and the chat session. `useChats` currently cleans up caches when unmounted; placing it only on the Chats route would needlessly discard data whenever a player changes tabs. Keep identity-scoped orchestration above that route, while a conversation-specific query can mount with its conversation page. Reset all private state on sign out or a session/player change.

Extract game form state/validation out of the large PlayerGame JSX without changing its payloads or rounding rules. The server remains authoritative. Consolidate duplicated money input helpers only after checking the existing accepted formats; do not convert arbitrary money strings through JavaScript Number. Keep the admin event projection pure and separate from its rendering.

The current admin view intentionally returns full engine state. Keep that coupling contained in the admin controller. A dedicated admin API DTO, stronger player-view unions, engine package extraction, and new backend pause/unread/count fields are separate follow-up work, not prerequisites for this UI.

## Implementation and review status

The visual implementation is underway in this worktree. Bodoni Moda is now the display face, the semantic palette follows the updated invitation-derived tokens, and player/admin surfaces use a restrained red-paper visual system. The player session boundary, game panels, wallet, teams, reveals, chats, session setup/live/review organization, and themed activity rendering are represented in the current source tree above.

Review remains in progress. The completion criteria below are targets, not a claim that every viewport, browser case, or game state has passed. Root is coordinating validation and will record actual outcomes separately; this plan does not claim a completed end-to-end suite.

Prefer small commits grouped by these seams so this branch can incorporate concurrent features from main without a single huge stylesheet/component replacement. Before migrating a component, compare it with main for new functionality, then preserve those changes while adapting presentation. Never merge another branch blindly over work in the main directory.

## Completion criteria

- Phone screenshots at 320, 375/390, and 430px show no horizontal page scrolling; desktop admin is checked at roughly 1280px.
- The primary Play task is visible without scrolling through finance, stars, or history; longer game forms can scroll naturally.
- Controls work with touch, keyboard, screen reader, 200% zoom, reduced motion, safe-area insets, and an open phone keyboard. Inputs use readable 16px text. Sticky controls never cover content.
- Cave countdown uses server deadlines, recovers after backgrounding, and does not announce every tick to assistive technology. Wallet/chat navigation adds no game pauses or automatic decisions.
- Public/private reveals preserve visibility and acknowledgment behavior on every route, including after the current team acknowledges.
- Retry and stale-token behavior remains correct across navigation. An uncertain transfer cannot be replaced by another financial command.
- Login, invitations, leader restrictions, team assignment, activation, arrivals, prepared/complete rounds, resets, and review retain current behavior.
- No hidden choices, balances, opponent earnings, circle structure, cave attendance, or bomb direction appear through decorative text, charts, navigation badges, or frontend state.
- Money remains cent-accurate and handles long balances without truncating the actual value. All copy remains readable for long team names and game titles.
- All five game forms, loading/error/empty states, and finished play receive visual review; red is not the sole indication of success, failure, or selection.

## Assets and current decisions

All required design assets are now available in this worktree:

- `reference/invitation.jpg`: original visual reference; do not use as a page background with baked-in text.
- `reference/brand-die.svg`: original supplied D20, about 862KB. Optimize a production copy and inspect its texture; preserve the original.
- `reference/poker-chips.svg`: new supplied chips. Includes embedded raster texture and an exported paper background; inspect on intended surfaces rather than treating it as a tiny all-vector icon.
- `assets/spinner.svg`: newly created red/pink spinner with a cream rim, black pointer, and light stipple texture. Editable transparent SVG, with no raster imagery, labels, numerical outcomes or animation. Use as an occasional supporting illustration on login/waiting screens, not as a real randomizer or loading animation.
- `assets/fonts/bodoni-moda/`: Bodoni Moda variable and its SIL Open Font License, copied from the app font source for local preview. This is the selected heading face; Geist remains the app body and control face.
- `assets/fonts/dm-serif-text/`: retained design exploration asset; not used by the current UI.
- `asset-preview.html`: static specimen of the illustration set, selected heading font, current palette, and phone-size typography. Example values are design samples, not gameplay fixtures.

The invitation's Awesome Lathusca lettering was unavailable. Bodoni Moda was chosen as a legible, theatrical substitute. Font provenance: [Google Fonts Bodoni Moda](https://github.com/google/fonts/tree/main/ofl/bodonimoda); the bundled variable font is distributed under the SIL Open Font License. No additional font or spinner file is required from the user.

The optional black-wave motif and invitation border can be authored in SVG/CSS if needed; use them sparingly. Assets no longer block visual work. Application implementation and this design record live in the UI worktree; validation results remain separate until performed.
