# Open Agricola Architecture

[English](ARCHITECTURE.md) | [中文](ARCHITECTURE_zh.md)

> Canonical architecture map of `main`. This index holds the design invariants, the topology and the layer layout. Each module document under [`architecture/`](architecture/) states that module's responsibilities, invariants and seams, and points to the entry files, ADRs and tests that hold the details. Card behavior lives in each card's tests; design decisions live in [`docs/adr/`](adr/).

## Module map

| Module | Document | Responsibilities |
|---|---|---|
| `shared/contract/` | [contract](architecture/contract.md) | Shapes shared by client, server and sandbox: `GameState`, commands, events, interactions and previews |
| `shared/engine/` | [engine](architecture/engine.md) | Node-tree engine, node metadata, `EngineStack` |
| `shared/session/` | [session](architecture/session.md) | `GameCore` entry points, `SessionResponse`, rotation, Turn Scope, recovery |
| `shared/actions/` | [actions](architecture/actions.md) | Action definitions, effects and internal actions, farm-type commits, anytime windows |
| `shared/actions/payment/` | [payment](architecture/payment.md) | `ComplexCost`, the fixed pipeline, Candidate Closure, receipts |
| `shared/actions/` hooks | [hooks](architecture/hooks.md) | Hook registry, action execution order, Stage Dispatch, listener purity |
| `shared/cards/` | [cards](architecture/cards.md) | Card Source, generated catalog, `cardStates`, Card Fields, capabilities |
| `shared/domain/` | [domain](architecture/domain.md) | `PlayerBoard`, farmyard, animals, scoring, major supply |
| `shared/draft/`, `shared/custom-code/`, Game Variants, `i18n`, `utils` | [shared-other](architecture/shared-other.md) | Simultaneous draft, Game Variants, Workshop admission, locale, utilities |
| `server/` | [server](architecture/server.md) | Connections, Rooms, Durable Room Commit, Replay, Bug Report, Workshop backend, persistence, operations |
| `client/` | [client](architecture/client.md) | Bundles, transport and synchronized state, views, Replay Viewer, Bug Report |
| Tests and gates | [testing](architecture/testing.md) | Test layers and architecture fitness checks |

Each module document has a Chinese mirror (`<module>_zh.md`) next to it.

---

## Design Goals and Invariants

The primary path is **WebSocket room gameplay + backend authority + passive frontend rendering**. HTTP serves startup, debugging, operations and test support, plus the versioned Game Context, Replay and Bug Report product APIs.

Violating any invariant below is an architecture bug:

- **Sole backend owner:** `GameSession` in `server/game/authoritative-session.ts` is the only server command entry and owns `GameState`; mutations execute in the `GameCore` and action leaves it drives.
- **Command-driven:** the frontend sends intent. The backend validates, executes, commits state, produces logs, and broadcasts.
- **Weak client:** the frontend renders, collects input, and manages temporary local UI state. It never adjudicates rules and never commits optimistically: game UI changes only after `stateUpdate` arrives.
- **Full snapshots:** every client in a room receives the same `stateUpdate`; the frontend does not apply partial patches.
- **WebSocket game path:** `/ws` receives `ClientCommand` and emits `StateUpdateEnvelope`.
- **`InteractionState` is the only frontend interaction truth:** `stateId` is `idle`, `wait`, or `gameover`; `wait` branches on `request.kind`.
- **One domain implementation:** actions, engine, cards, rounds, harvest, and scoring live in `shared/` and are reused by both frontend and backend.
- **Physical three-layer boundary:** ESLint `architecture/imports` enforces `shared/` ⇄ `server/` ⇄ `client/` as CI errors. There are no circular dependencies.
- **Client bundle boundaries:** `client-app` does not import `shared/{engine,session,actions,cards,custom-code,draft}`; sandbox and Worker permissions are restricted to the exact entries and files in `scripts/architecture-policy.mjs`.
- **The node tree is the only state machine:** `engine.peekPendingEnvelope()` and the pending host derive what execution is waiting for.
- **Flows enter the engine only through its seams**: `EngineStack.push` / `pop` create and leave nested frames, and `Engine.injectBeforeFlows()` inserts hook and anytime flows into the current frame. Never mutate `pending` directly.
- **`ActionFlow` matches the reference's small algebra:** the card DSL exposes only `leaf`, `seq`, `parallel`, `xor`, and `or` plus metadata. Runtime-only nodes do not enter card flows.
- **Listener handlers do not mutate state:** listener, preview, and doability paths build flows or return structured values. Mutation occurs only while an action leaf executes.
- **Card-local closure:** a card is finished inside `shared/cards/{Deck}/{Card}.ts`. Core files such as `shared/actions/effects/pay.ts`, `shared/actions/effects/improvement.ts`, `shared/session/session-core.ts` and `server/game/authoritative-session.ts` do not change for one card. A new hook point requires tests and documentation in the same change.
- **Local `cardStates`:** persistent counters and markers use `player.cardStates[cardId]`; later choices use explicit pending state and continuations.
- **Supply tokens are payment resources:** player supply limits such as fences and stables must not be hard-coded as 15 or 4. Read them through supply-token helpers or the payment-resource pipeline.
- **Durable Room Commit:** a successful command that changes the public Frame or Private Session Cursor, or any response marked `durableTransition`, atomically writes Room snapshot and Replay Step before sending viewer-filtered state.
- **Global Replay Steps:** simultaneous submissions still receive consecutive `stepNo`; automatic settlement belongs to the last triggering input and results do not depend on arrival order.
- **Failures do not spread:** command errors reach only the caller; durable rejections still publish the committed version to peers as error-free snapshots. Persistence failure freezes the same Frame and blocks the Room instead of overwriting or advancing.
- **Room limits:** one instance holds at most 30 ordinary waiting and playing Rooms and 15 Worker slots. Reaching a limit rejects only operations that need another Room or Worker, including `newGame`; existing Rooms keep running.
- **Immutable historical Viewer:** a Room freezes schema and Build. Completed playback uses a credentialless read-only Viewer and never executes historical rules code.
- **Tests default to two players.** Prove rules at the backend boundary, never infer them from the DOM.

---

## System Topology

```text
Browser windows p1 / p2 / p3 / p4
        │
        │ WebSocket /ws            ← primary path
        ▼
server/connection/ws-server.ts
  ├─ connection lifecycle / auth
  ├─ command routing
  └─ StateUpdateEnvelope broadcast
        │
        ▼
server/game/{room.ts, room-registry.ts, lobby.ts}
        │
        ▼
server/game/authoritative-session.ts (GameSession extends GameCore)
  ├─ sole server command entry and GameState owner
  ├─ inherits GameCore, which owns EngineStack
  ├─ undo history / action-start snapshots
  └─ computes InteractionState and scores
        │
        ├─→ shared/session/ (GameCore, phases/)
        ├─→ shared/engine/  (Engine, EngineStack, nodes/)
        ├─→ shared/actions/ (effects/, payment/, hooks)
        ├─→ shared/cards/   (decks A..E, M, major, community)
        └─→ shared/domain/  (PlayerBoard, farmyard, scoring, ...)
        │
        ▼
server/game/persistence/
  ├─ postgres-adapter.ts (DATABASE_URL)
  └─ memory-adapter.ts   (tests)
```

`server/game-router.ts` retains HTTP `/api/*` endpoints for health checks, room lists, snapshot recovery, test fixtures, development debugging, and sandbox creation.

---

## Three-Layer Directory Structure

```text
shared/        No React; shared by frontend, backend, and sandbox
├── contract/      Protocol shapes: GameState, InteractionState, ClientCommand, StateUpdateEnvelope
├── engine/        Node-tree engine + EngineStack
├── session/       GameCore + phases/ for setup, round, harvest, and draft
├── actions/       Action definitions, effects/, payment/, and hooks
├── cards/         Card Source by decks A–E, M, major and community; each card owns meta + impl
├── domain/        Domain aggregates: PlayerBoard, farmyard, pasture, scoring, ...
├── draft/         Simultaneous card selection
├── custom-code/   Custom-card AST validation
├── i18n/          Locale keys
└── utils/         Shared utilities

server/        Node process: HTTP + WebSocket + persistence + custom-code isolation
├── index.ts             Composes HTTP, WebSocket, database, and static assets
├── connection/          WebSocket layer: ws-server, room-router, broadcaster
├── game/                Room, GameSession, Lobby, RoomRegistry
│   └── persistence/     PostgreSQL Room storage and isolated test substitutes
├── game-router.ts       HTTP /api/* routes
├── auth.ts              Site login and OAuth (GitHub, Google)
├── workshop.ts          Workshop and Sandbox backend
├── workshop-pr/         Workshop pull-request integration
├── custom-code/         Isolated execution: engine, runtime, executor-worker
├── payload-validation.ts  Pure validation; never writes state
└── db.ts                PostgreSQL connection

client/        Browser React UI
├── app/                 Top-level routing and pages: GameContainerApi, LobbyPage, ...
├── components/          board/, interaction/, common/, header/
├── contexts/            AuthContext, LocaleContext
├── hooks/               useGameSync, useFarmSelection, ...
├── services/            gameTransport, card-meta, rehydrate, llm/generation
├── sandbox/             Lazy Workshop sandbox UI
└── types/, utils/, styles/, assets/, config.ts, main.tsx

e2e-tests/     Playwright browser tests
```

`eslint.config.js` enforces the three layers:

- `client/{app,components,services,hooks,contexts,utils}/**` cannot import `shared/session`, `shared/engine`, Card Source, generated card catalogs, or per-card implementation modules. UI metadata must come from `public/cards-manifest.json` through `client/services/card-meta`.
- Privileged entries are the exact Workshop sandbox entry and isolated local worker listed in `scripts/architecture-policy.mjs`; no directory-wide exemption exists.
- One resolved-import rule checks static imports, re-exports, literal dynamic imports, and require calls without flat-config overrides.
- Every violation is a CI error.

---
