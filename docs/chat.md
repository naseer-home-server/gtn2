# Player chat

Chat is available to invited players while a game session is active. Each player has their own inbox of conversations they belong to. A direct conversation is addressed to another team, so every player on both teams sees the same thread; opening it from either team reuses that conversation. A group includes its creator and the two to nine other invited players they select, with a name up to 60 characters. A player can read or send messages only in conversations they belong to.

The inbox exposes the invited player list and team membership for choosing recipients. It does not expose balances, ranks, earnings, game state, or other private gameplay data. Conversation membership and messages belong to the session and remain available for the session's lifetime, independent of gameplay state and gameplay resets.

The inbox refreshes every two seconds while the player is signed in, and messages refresh every two seconds while a conversation is open. Polling pauses in background tabs. With up to ten players, this keeps new messages reasonably prompt without creating a large request load. Message pages are returned in chronological order. To load older messages, pass the sequence number of the oldest message currently shown; the next page contains only earlier messages.

Each send includes a client-generated message ID. Retrying the same ID with the same conversation and text returns the original message, so a lost response does not create a duplicate. Reusing that ID for different content is rejected.

## API and implementation

The `chat` tRPC router provides `inbox`, `direct`, `createGroup`, `messages`, and `send`. Each operation resolves the authenticated email against the active session on the server. Direct chats reuse a unique session/team-pair key; groups keep their original member list. Message sends are idempotent per conversation, sender, and UUID request ID. History uses 50-message pages with a `beforeSequence` cursor.

Persistence, API access, and UI hooks remain separate. No socket service or new production dependency is required.

For concurrent feature development, use a separate database and ports. For example, start the backend with `PORT=3014 APP_URL=http://127.0.0.1:5184` and an isolated `DATABASE_URL`; start the frontend with `GAME_BACKEND_URL=http://localhost:3014 pnpm --filter frontend dev --port 5184 --strictPort`. Use the existing anton forwards if already running. Avoid applying this branch's migration to another thread's test database. If combining branches that both add Drizzle migrations, reconcile the journal and regenerate the combined migration before applying it.

Validation covered the production build, frontend lint, backend unit tests, isolated PostgreSQL chat tests, concurrent direct creation and message retries, and browser checks for a nonleader sending team/group messages, loading older messages, and receiving a polled reply.
