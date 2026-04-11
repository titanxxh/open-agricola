# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Open Agricola — an online implementation of the Agricola board game using React + TypeScript + Vite (frontend) and a Node.js WebSocket/HTTP server (backend). Backend-authoritative architecture with real-time multiplayer sync. Includes a card workshop with LLM-assisted card design and user authentication.

## Commands

```bash
# Install dependencies (canvas requires native libs: libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev libpixman-1-dev)
npm install

# Start both frontend (5173) and backend (5175)
./restart-intranet.sh

# Or start separately
npm run server   # Backend on port 5175
npm run dev      # Frontend on port 5173

# Tests
npm test                # Vitest unit tests (~642 cases, excludes e2e and scripts/)
npm run test:e2e        # Playwright E2E tests (requires running server + frontend)
npx vitest run tests/path/to/file.spec.ts   # Run a single test file

# Lint & build
npm run lint            # ESLint (~340 pre-existing any-type warnings, not blocking)
npm run build           # tsc + vite build (warnings about /bga-img/* are cosmetic)
```

## Architecture

### Three-Layer Design

```
shared/    ← Pure domain logic (no React, no Node APIs). Used by both frontend and backend.
server/    ← Backend: HTTP + WebSocket server, authoritative state
src/       ← Frontend: React UI, transport abstraction, hooks
```

### Backend Authority Pattern

`GameSession` (server/game-session.ts) is the **sole writer** of `GameState`. All state mutations flow through it:

1. Client sends `ClientCommand` via WebSocket (or HTTP for debug)
2. `RoomManager` routes command to the room's `GameSession`
3. `GameSession` executes the command, returns `SessionResponse` (`ok`, `state`, `pending`, `scores`, etc.)
4. `RoomManager` serializes state as `StateUpdateEnvelope` and broadcasts full snapshot to all clients
5. Frontend receives snapshot, rehydrates state, and re-renders

No optimistic updates — frontend always waits for server confirmation.

### Flow Engine (shared/engine/)

Actions are executed as node trees (behavior-tree-like). Key node types:
- `SequenceNode`, `ParallelNode`, `OrNode`, `XorNode` — control flow
- `ChoiceNode` — awaits player input
- `ActionNode` — executes a leaf action
- `ActivateCardNode` — triggers card listener
- `PlayerSwitchNode` — transfers control between players

`Engine.step()` returns `EngineStepResult`: `done | blocked | choice | ok | playerSwitch`. The engine drives all action execution including multi-step flows, card triggers, and pending choices.

### Hook System (shared/actions/hooks.ts)

Card effects extend the game through hooks rather than modifying core paths. Hook phases:
- `before`, `during`, `immediatelyAfter`, `after` — execution lifecycle
- `computeCosts`, `computeArgs`, `computeReplace` — action customization
- `isDoable` — availability override
- `canUseOccupied` — allow using occupied action spaces

### Transport Abstraction (src/services/)

`GameTransport` interface unifies HTTP and WebSocket. Two implementations:
- `HttpGameTransport` — single-player debugging (all methods are HTTP POST)
- `WsGameTransport` — multiplayer real-time (WebSocket messages, HTTP fallback for validation only)

Frontend code uses `GameTransport` without knowing the underlying transport.

### Pending States

Mutual-exclusion pending model drives UI interaction:
- `none` — awaiting player action
- `choice` — player must select from options
- `animalReorg` — animal placement required
- `harvestFeed` — harvest feeding required

### Key Types

- `shared/game/types.ts` — `GameState`, `PlayerState`, `Resource`, `ActionSpace`, `PendingAction`, `ActionFlow`
- `shared/protocol/game.ts` — `GameSyncPayload`, `StateUpdateEnvelope`
- `shared/protocol/ws.ts` — `ClientCommand`, `ServerEvent`
- `shared/game/serialization.ts` — `serializeState()` / `rehydrateState()`

### Action System (shared/actions/)

Actions are auto-discovered from per-effect files in `shared/actions/effects/*.ts`. Each effect file exports an action definition with `id`, `nameKey`, `flow` (node tree), and round availability. Anytime actions (e.g., bake bread, exchange) are also auto-discovered and merged into the action registry. Action factories in `shared/actions/factories/` (e.g., `createGainAction()`) generate common action patterns.

### Room System

`RoomManager` (server/room-manager.ts) maintains `Map<roomId, Room>`. Each room has an independent `GameSession`. A persistent dev room (ID `dev`, configurable via `PERSISTENT_ROOM_ID`) survives backend restarts via JSON state files in `output/`.

### Custom Cards & Workshop

- `shared/cards/custom-registry.ts` — Runtime custom card registration
- `shared/cards/custom-dsl-runner.ts` — DSL → ActionFlow (whitelisted actions only)
- Workshop UI at `src/app/WorkshopPage.tsx` with LLM-assisted card design (`src/app/workshop/AiCardDesigner.tsx`)
- Card art uploaded to `/api/workshop/art`, served from `/card-art/`
- LLM API keys stored **only** in browser `localStorage` — server never sees them

### Authentication & Persistence

- User auth via `/api/auth/*` endpoints (register, login, logout, session validation)
- `AuthContext.tsx` provides auth state and `apiFetch()` helper
- Room persistence: `PERSIST_ROOMS=sqlite` uses SQLite (`DB_PATH=./data/open-agricola.db`), default is JSON files
- `ALLOW_ANONYMOUS_WS=true` skips WS auth (default in dev)

### TypeScript & Build

Three tsconfig projects: `tsconfig.app.json` (frontend + shared), `tsconfig.server.json`, `tsconfig.node.json`. No path aliases — all imports use relative paths. Vite serves BGA card images via a plugin reading from `BGA_IMAGE_DIR` (defaults to `../bga-agricola/img`); missing images only affect display, not rules.

## Test Structure

Three test tiers:

- **Unit tests** (`shared/**/__tests__/*.test.ts`) — Pure domain logic. Create mock `PlayerState`/`GameState` objects directly, call functions, assert results.
- **Session tests** (`server/__tests__/*.test.ts`) — Instantiate `GameSession` directly, call `takeAction()` / `confirmAnimalReorg()` etc., assert on `resp.state`, `resp.pending`, `resp.ok`.
- **E2E tests** (`e2e-tests/*.spec.ts`) — Playwright browser tests against running server + frontend. 120s timeout, headless, 1920×1080 viewport.

Rule correctness tests should use session tests (tier 2). Assert on `state`, `pending`, `log`, `scores` — never on DOM elements.

## Development Guidelines (from AGENTS.md)

- **Backend authority**: Rules live in `shared/` + `server/`. Never put rule logic in frontend UI.
- **No circular dependencies**.
- **Card encapsulation**: Card abilities must be self-contained in their card file (`shared/cards/`). No card-specific `if-else` in core paths. Use hooks, modifiers, and `player.cardStates[cardId]` for per-card state.
- **Don't modify core paths** (`pay.ts`, `improvement.ts`, `game-session.ts`) for single-card needs. Use existing extension points (hooks, modifiers, card definition fields).
- **Card naming**: Files are `{Deck}_{Number}_{Name}.ts` (e.g., `A123_FrameBuilder.ts`).
- **Test-first for cards**: Write test specification based on `docs/CARD_TEST_TEMPLATE.md` before implementing.
- **Tests drive through backend boundary**: Use `GameSession`, HTTP API, or WS commands. Assert on `state`, `pending`, `log`, `scores` — not DOM elements.
- **Default to 2-player games** in tests.
- **Commit messages**: `feat:`, `fix:`, `refactor:` prefixes. English only.
- **After code changes**: Run `npm test` to verify. Update relevant docs (`docs/IMPLEMENTATION_STATUS.md`, `docs/ENGINE_ARCHITECTURE.md`, `docs/cards_impl.md`, `docs/card_progress.md`).
- **BGA reference**: For uncertain implementations, consult `output/bga-agricola` (the upstream BGA Agricola reference, gitignored) unless `docs/ENGINE_ARCHITECTURE.md` specifies a different design.

## URL Parameters (for manual testing)

```
?player=p1          # Player 1 perspective
?player=p2          # Player 2 perspective
?transport=ws       # Enable WebSocket multiplayer
?room=<id>          # Join specific room
?devMode=1          # Enable dev panel (resource editing, round jump, card tools)
?customCards=id1,id2  # Load workshop card IDs into WS room on createRoom
?page=login         # Force login page (default: lobby when authenticated)
?page=workshop      # Open workshop
```

## gstack

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

Available gstack skills:
- `/office-hours` — Brainstorming and idea exploration
- `/plan-ceo-review` — Strategy-level plan review
- `/plan-eng-review` — Architecture-level plan review
- `/plan-design-review` — Design-level plan review
- `/design-consultation` — Creating a design system
- `/review` — Code review before merge
- `/ship` — Create PR / deploy
- `/land-and-deploy` — Land and deploy changes
- `/canary` — Canary deployment
- `/benchmark` — Performance benchmarking
- `/browse` — Web browsing and navigation
- `/qa` — QA testing
- `/qa-only` — QA testing (no code changes)
- `/design-review` — Visual design audit
- `/setup-browser-cookies` — Set up browser cookies
- `/setup-deploy` — Set up deployment
- `/retro` — Weekly retrospective
- `/investigate` — Debugging errors
- `/document-release` — Post-ship documentation
- `/codex` — Adversarial code review / second opinion
- `/careful` — Working with production / live systems
- `/freeze` — Scope edits to one module/directory
- `/guard` — Maximum safety mode
- `/unfreeze` — Remove edit restrictions
- `/gstack-upgrade` — Upgrade gstack to latest version
