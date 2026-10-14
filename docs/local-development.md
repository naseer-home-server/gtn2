# Local development and test fixtures

Each checkout or Git worktree runs the app against its own Docker PostgreSQL instance. SuperTokens Core is shared through the `anton` SSH forward. Node and pnpm versions are pinned in `.nvmrc` and `package.json`.

## First setup in each checkout

Start the SuperTokens forward once and leave it running; all local worktrees share it:

```sh
./scripts/pf-anton
```

Then, from each checkout's repository root:

```sh
nvm use
pnpm install
pnpm setup:local
pnpm dev
```

`setup:local` allocates available PostgreSQL, backend, and frontend ports, starts PostgreSQL, applies migrations, and creates the test fixtures. It prints this checkout's app URL and player emails. `pnpm dev` starts its database if necessary and runs the backend and frontend. You can also use `pnpm --filter game dev` after setup, with `pnpm db:up` to start its database first.

Setup writes ignored `.env.local`, `game/backend/.env`, and `game/frontend/.env` files. When creating a Git worktree, it inherits only the shared SuperTokens connection/API key and Dashboard allowlist from the main checkout's backend `.env`, if available. It preserves this worktree's existing auth settings. On a fresh clone, set `SUPERTOKENS_API_KEY` in `game/backend/.env` if the forwarded Core requires it. The default host connection is `http://127.0.0.1:1233`. Setup does not create or change any SuperTokens accounts. Sign in as `admin@test.com` using the existing local admin account's configured password.

## Worktree isolation and persistence

Compose normally names a project after the checkout directory's basename. Since managed worktrees can all end in `gtn2`, relying on that default could reuse another worktree's containers and volumes. The local commands explicitly use `gtn2-<absolute-path-hash>` as the Compose project name. PostgreSQL's named volume is `<project>_postgres-data`; restarting or rebuilding containers keeps its data. Each worktree receives its own available host ports and app origin.

Use these commands from the checkout you want to operate on:

```sh
pnpm local:info   # Show this checkout's project, volume, ports, and app URL.
pnpm db:up        # Start PostgreSQL and wait for its health check.
pnpm db:down      # Stop PostgreSQL; preserve its volume and fixtures.
pnpm db:seed      # Create missing fixtures; preserve existing progress.
pnpm test:db      # Run the backend suite with PostgreSQL tests enabled.
pnpm test:local   # Check local setup, worktree identity, and port handling.
```

Run local database commands through these wrappers so the correct project name and `.env.local` are selected. Keep the generated env files in their checkout; moving/copying them between worktrees requires running `pnpm setup:local` again. If you need specific ports on first setup, supply `POSTGRES_PORT`, `BACKEND_PORT`, and/or `FRONTEND_PORT` in the command environment. Vite fails on an occupied configured port so it cannot silently move away from the auth callback origin.

The PostgreSQL port binds to `127.0.0.1`. The credentials `gtn2` / `gtn2` and database `gtn2` are local development defaults. The backend connection uses this checkout's published port; a Docker app connection uses the `postgres` service hostname. The local PostgreSQL service has a Compose profile and is started explicitly by the wrappers. Deployment continues to use the deployment `.env` and its `DATABASE_URL`.

The standard forward exposes only SuperTokens. Use `./scripts/pf-anton --with-db` when you explicitly need the remote PostgreSQL forward as well. Local setup and tests use the Docker database.

## Seeded sessions

The script enables the admin-controlled player email test login setting in the local database. The fresh database activates **E2E Playthrough**. Only one session can be active: choose another in the admin **Sessions** page before logging in with its invited players.

| Session | People / teams | Starting checkpoint | Player email accounts |
| --- | --- | --- | --- |
| E2E Playthrough | 10 / 5 pairs | Game 1, round 1 | `e2e-player-01@test.com` through `e2e-player-10@test.com` |
| UX Preview: Bonus | 3 / one pair and one solo | Bonus, round 1 | `ux-bonus-leader@test.com`, `ux-bonus-partner@test.com`, `ux-bonus-solo@test.com` |
| UX Preview: High or low | 3 / one pair and one solo | High or low, round 1 | `ux-high-low-leader@test.com`, `ux-high-low-partner@test.com`, `ux-high-low-solo@test.com` |
| UX Preview: Cave | 3 / one pair and one solo | Cave, round 1 | `ux-cave-leader@test.com`, `ux-cave-partner@test.com`, `ux-cave-solo@test.com` |
| UX Preview: Circle | 3 / one pair and one solo | Circle, round 1 | `ux-circle-leader@test.com`, `ux-circle-partner@test.com`, `ux-circle-solo@test.com` |
| UX Preview: Bomb | 3 / one pair and one solo | Bomb, round 1 | `ux-bomb-leader@test.com`, `ux-bomb-partner@test.com`, `ux-bomb-solo@test.com` |

All invitees are marked arrived in the listed order and teams are assigned. E2E pairs are 01+02, 03+04, 05+06, 07+08, and 09+10; the odd-numbered account leads each pair. The E2E fixture uses the default game configuration and waits for the host to start Bonus round 1, then supports the full 15-round playthrough. It has no completed rounds or player decisions prefilled.

Three people is the supported minimum: the app requires two teams and allows at most one solo team. Each UX fixture includes a pair so you can compare leader and teammate views, plus a solo opponent. UX fixtures have useful funds and later checkpoints include stars and prior outcomes generated by the shared engine. They wait at round 1 until the host starts the selected game. Cave's clock therefore stays idle while its checkpoint is inactive or waiting to start.

To preview a game, set its **UX Preview** session active, use the host's **Start** button, and log in through **Player test login** with one of the listed emails. Use separate browser profiles for independent player logins; tabs in one profile share authentication. The admin can inspect state, outcomes, and the audit in the same session.

Regular seeding preserves existing session progress, names, messages, and the active session. To restore all six seeded sessions to their original checkpoints:

```sh
pnpm db:seed --reset
```

Reset recreates only seed-owned fixtures, including their invitations and gameplay/chat history. User-created sessions are preserved. Stop the app before resetting to avoid in-flight requests from old fixture IDs; refresh open session pages afterward. The seed command requires `LOCAL=true`, rejects production mode and remote database hosts, and never operates on the forwarded PostgreSQL connection through the local wrapper.
