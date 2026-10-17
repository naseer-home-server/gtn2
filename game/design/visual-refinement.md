# Visual refinement — 16 October 2026

The previous pass still read as a functional wireframe: oversized amounts, thin-rule divisions at every level, a tiny two-line wordmark, and ungrouped secondary forms. The invitation is an identity reference, not a reason to turn every app screen into a poster.

Direction: a composed private game-club companion. Keep the red, ink, and paper, then use type, surfaces, and spacing with a consistent hierarchy. Use small bespoke game emblems as the visual signature; reserve the supplied textured illustrations for branding and waiting states.

Tokens: Paper #F4F0E8; Surface #FFFDFA; Ink #000000; Crimson #B80712; Quiet #70695F; Line #E3DDD3. Bodoni Moda at 32–36px for page titles, Geist for all interface text (13px metadata, 14px body, 16px inputs). Main controls 50–52px. Surface radius 18px, fields 12px, pills only for status/navigation. No ornamental gradients.

Phone composition, left aligned:

    die + Game Theory / Night 2             account
    Game 2 of 5                        Round 1 / 3
    five small progress segments
    High or low                         game emblem
    Short game instruction
    Team identity                              stars
    ┌─────────────────────────────────────────────┐
    │ Choose an amount                    Private │
    │ [ editable amount                         ] │
    │ Maximum 200.00                              │
    │ [ Choose amount                           ] │
    │ First accepted choice is final.             │
    └─────────────────────────────────────────────┘
    Rules disclosure
    Quiet fixed navigation with a contained active state

Wallet uses a single crimson account surface, then a segmented section switch and clean transfer/reveal forms. Teams use one grouped roster. Chats use identity rows and a contained composer. Admin uses compact grouped working surfaces.

Review against brief: ivory plus serif is appropriate because the provided invitation explicitly establishes it. The design should not depend on hairlines, big numeric typography, or an assortment of identical dashboard cards. The five-game progress sequence and custom emblems are grounded in this actual event; no badges imply hidden game information. Preserve all command, retry, privacy, and identity boundaries.


## UX follow-up — 17 October 2026

Play now includes the private team balance alongside the team identity/stars, in crimson tabular figures linked to Wallet. This keeps the account visible without adding another full-size panel above the decision. Finished play retains this account row.

Chats uses a boolean notification dot, with conversation dots to locate unread messages. Existing inbox polling provides a latest incoming sequence for each permitted conversation; browser-local read positions are keyed to session and player. Read positions advance only for displayed incoming messages in a visible open thread at the bottom. No counts, push permissions, schema migrations, or message text in local storage. Each teammate/device keeps its own read status.
