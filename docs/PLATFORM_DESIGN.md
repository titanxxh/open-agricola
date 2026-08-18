# Open Agricola Platform Expansion: Design and Evolution

[English](PLATFORM_DESIGN.md) | [中文](PLATFORM_DESIGN_zh.md)

## Context

The project has grown from a standalone game engine into a complete platform with accounts, a game lobby, database persistence, and a Card Workshop with LLM-assisted design, while retaining backend authority.

Sections A through G record the original choices and later evolution. SQL and route fragments are illustrative; section J lists current implementation status and entry points, while source code defines runtime behavior.

---

## A. Architecture choices

### A1. Database: SQLite with `better-sqlite3`

Why SQLite instead of PostgreSQL or MongoDB:

- This is a single-server independent project, and SQLite requires no daemon, connection pool, or separate container.
- Existing persistence already uses synchronous `readFileSync` and `writeFileSync`; the synchronous `better-sqlite3` API fits naturally.
- Game state is deeply nested JSON, and SQLite supports stored JSON plus queries through `json_extract`.
- Social features such as likes and comments are relational and easily fit this scale.
- A backup is a copy of one `.db` file.

Database path: `./data/open-agricola.db`.

Schema design:

```sql
-- Users
CREATE TABLE users (
  id TEXT PRIMARY KEY,            -- nanoid
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,    -- crypto.scrypt
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);

-- Sessions
CREATE TABLE sessions (
  token TEXT PRIMARY KEY,         -- crypto.randomUUID
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- Game rooms, replacing JSON-file persistence
CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  created_by TEXT REFERENCES users(id),
  state_json TEXT,                -- SerializedGameState JSON
  max_players INTEGER DEFAULT 2,
  status TEXT DEFAULT 'waiting',  -- waiting | playing | finished
  version INTEGER DEFAULT 0,
  started_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Room players
CREATE TABLE room_players (
  room_id TEXT NOT NULL REFERENCES rooms(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  player_index INTEGER NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (room_id, user_id)
);

-- Scalar summary for a normally completed game; room_id is never reused
CREATE TABLE game_results (
  room_id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  finished_at INTEGER NOT NULL,
  rounds_played INTEGER NOT NULL,
  player_count INTEGER NOT NULL,
  enable_community_deck INTEGER NOT NULL,
  enable_parent_cards INTEGER NOT NULL,
  enable_through_the_seasons INTEGER NOT NULL,
  enable_farmers_of_the_moor INTEGER NOT NULL
);

CREATE TABLE game_result_players (
  room_id TEXT NOT NULL REFERENCES game_results(room_id) ON DELETE CASCADE,
  player_index INTEGER NOT NULL,
  game_player_id TEXT NOT NULL,
  user_id TEXT,
  display_name TEXT NOT NULL,
  score INTEGER NOT NULL,
  PRIMARY KEY (room_id, player_index)
);

-- Workshop cards
CREATE TABLE workshop_cards (
  id TEXT PRIMARY KEY,            -- nanoid
  author_id TEXT NOT NULL REFERENCES users(id),
  card_id TEXT NOT NULL,          -- e.g. CUSTOM_FireDragon
  card_type TEXT NOT NULL,        -- minor | occupation
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  card_json TEXT NOT NULL,        -- CardDefinition JSON plus CARD_DEF and CARD_IMPL TypeScript
  -- Historical effect_dsl/effect_code/compiled_code columns were dropped in migration v7
  art_url TEXT,
  art_prompt TEXT,
  review_status TEXT DEFAULT 'unsubmitted', -- unsubmitted | in_review | approved | stale | merged, PRD #634
  live INTEGER DEFAULT 0,         -- only approved cards can be live; Rooms load approved_version_id snapshots
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Likes
CREATE TABLE card_likes (
  user_id TEXT NOT NULL REFERENCES users(id),
  card_id TEXT NOT NULL REFERENCES workshop_cards(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, card_id)
);

-- Comments
CREATE TABLE card_comments (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES workshop_cards(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Custom cards saved to a user's sandbox
CREATE TABLE sandbox_cards (
  user_id TEXT NOT NULL REFERENCES users(id),
  workshop_card_id TEXT NOT NULL REFERENCES workshop_cards(id),
  added_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, workshop_card_id)
);

-- Sandbox player, deck, and variant settings
CREATE TABLE sandbox_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  player_count INTEGER NOT NULL DEFAULT 2,
  deck_ids_json TEXT NOT NULL DEFAULT '["A","B","C","D","E"]',
  enable_through_the_seasons INTEGER NOT NULL DEFAULT 0,
  enable_farmers_of_the_moor INTEGER NOT NULL DEFAULT 0,
  allow_incomplete_farmers_of_the_moor_minor_deal INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
```

### A2. Authentication: server-side session tokens

Use server-side sessions instead of JWT:

- Support password registration with email verification plus GitHub and Google OAuth.
- Login creates an opaque `crypto.randomUUID()` session token stored in `sessions` with a seven-day expiry.
- Browsers use an HttpOnly session cookie for HTTP and WebSocket access.
- The WebSocket protocol continues to support explicit `{ type: 'auth', token: '...' }` authentication.
- A single server does not need stateless JWTs, while server sessions allow immediate revocation.

### A3. Frontend routing: URL parameters and `PageRouter`

Do not add `react-router`; retain the current URL-parameter style through `?page=`:

- `?page=login`: login and registration;
- `?page=lobby`: lobby, the authenticated default;
- `?page=workshop`: Workshop;
- `?page=game&room=xxx`: existing `GameContainerApi`;
- no `?page=` while unauthenticated: redirect to login.

```text
App.tsx
  -> AuthProvider (React Context)
    -> PageRouter (reads ?page=)
       -> LoginPage | LobbyPage | WorkshopPage | GameContainerApi
```

### A4. State management: keep hooks and add `AuthContext`

Do not add Redux or Zustand:

- `AuthContext` provides user state, login, logout, password registration and email verification, and OAuth entry points.
- Workshop uses `useState` plus `fetch`, matching the existing game style.
- HTTP uses `credentials: 'include'`; browser WebSocket automatically carries the session cookie.

---

## B. Deployment model

### B1. Extend the single-process server

Keep the raw Node.js HTTP server in `server/index.ts` and extend its routes:

```text
/api/auth/register       POST   register
/api/auth/login          POST   log in
/api/auth/logout         POST   log out
/api/auth/me             GET    current user

/api/lobby/rooms         GET    room list
/api/lobby/create        POST   create a room

/api/workshop/cards      GET    paginated, searchable, sortable card list
/api/workshop/cards/:id  GET    card detail
/api/workshop/cards      POST   create or update a card
/api/workshop/cards/:id/like     POST  toggle like
/api/workshop/cards/:id/comments GET   comment list
/api/workshop/cards/:id/comments POST  add a comment
/api/workshop/sandbox    GET/POST/DELETE  sandbox management

/api/game/*              existing routes
/ws                      existing WebSocket plus authentication handshake
```

### B2. Development

- `restart-intranet.sh` needs no change; server startup initializes the database with `CREATE TABLE IF NOT EXISTS`.
- `./data/open-agricola.db` is ignored by Git.
- At startup, check the schema version and run pending migrations.

### B3. Production

One host is enough:

- a Node.js process for backend and WebSocket plus Vite-built static files;
- SQLite persisted to disk;
- optional Nginx reverse proxy for static files and WebSocket;
- a clear future migration path from SQLite to PostgreSQL because their SQL is broadly compatible.

---

## C. Prompt-engineering design

### C1. Browser-to-LLM architecture

```text
┌───────────────────────────────────────┐
│  Browser                                │
│                                         │
│  localStorage: LLM config and API key   │
│       │                                 │
│       ▼                                 │
│  LLM service in client/services/llm     │
│       │                                 │
│       │  direct fetch with CORS         │
│       ▼                                 │
│  Gemini / OpenRouter / DeepSeek /       │
│  AiHubMix                               │
│                                         │
│  Never passes through the game server   │
└───────────────────────────────────────┘
```

- API keys and model settings stay in browser `localStorage`: ability/chat settings under `open-agricola-llm-config` and image settings under `open-agricola-llm-config-art`.
- `client/services/llm/registry.ts` is the provider registry; each provider file declares model `capabilities`.
- Chat normally uses an OpenAI-compatible streaming `POST {baseUrl}/chat/completions`. Gemini image, OpenRouter image, and AiHubMix image each implement provider-specific `generateImage`.
- The UI states clearly that the code is open for inspection and API keys never leave the browser.

#### C1.1 Currently supported LLM models

| Provider | Model ID | UI name | Default | Chat | Images | Notes |
|---|---|---|---|---|---|---|
| Gemini | `gemini-3.1-pro-preview` | Gemini 3.1 Pro Preview (65k) | Yes | Yes | Yes | Chat uses the Gemini OpenAI-compatible shim; images use Gemini `generateContent` |
| Gemini | `gemini-3.1-flash-image-preview` | Gemini 3.1 Flash Image | No | No | Yes | Image generation only |
| Gemini | `gemini-2.5-flash-image` | Gemini 2.5 Flash Image | No | No | Yes | Image generation only |
| OpenRouter | `qwen/qwen3.6-plus:free` | Qwen 3.6 Plus (Free) | Yes | Yes | No | OpenRouter chat model |
| OpenRouter | `google/gemini-2.5-flash-preview` | Gemini 2.5 Flash | No | Yes | No | OpenRouter chat model |
| OpenRouter | `google/gemini-2.5-pro-preview` | Gemini 2.5 Pro | No | Yes | No | OpenRouter chat model |
| OpenRouter | `openai/gpt-5-image-mini` | GPT-5 Image Mini | No | No | Yes | OpenRouter image model |
| OpenRouter | `google/gemini-2.5-flash-image` | Gemini 2.5 Flash Image / Nano Banana | No | No | Yes | OpenRouter image model |
| OpenRouter | `bytedance-seed/seedream-4.5` | Seedream 4.5 | No | No | Yes | OpenRouter image model |
| OpenRouter | `deepseek/deepseek-v4-flash` | DeepSeek V4 Flash | No | Yes | No | DeepSeek chat through OpenRouter |
| OpenRouter | `deepseek/deepseek-v4-pro` | DeepSeek V4 Pro | No | Yes | No | DeepSeek chat through OpenRouter |
| DeepSeek | `deepseek-v4-flash` | DeepSeek V4 Flash | Yes | Yes | No | Official DeepSeek API |
| DeepSeek | `deepseek-v4-pro` | DeepSeek V4 Pro (Reasoning) | No | Yes | No | Official API; display final content but not reasoning content |
| AiHubMix | `gemini-3.1-flash-image-preview-free` | Gemini 3.1 Flash Image (Free) | No | No | Yes | Free AiHubMix image model |
| AiHubMix | `coding-glm-5.1-free` | Coding GLM 5.1 (Free) | Yes | Yes | No | Free AiHubMix chat model |
| AiHubMix | `k2.6-code-preview-free` | K2.6 Code Preview (Free) | No | Yes | No | Free AiHubMix chat model |

OpenRouter has no provider-level fallback `chat` or `image` capability. Every model declares its own capabilities so image UI never shows chat-only models and chat UI never shows image-only models.

### C2. System prompt design

The source is `CARD_DESIGNER_SYSTEM_PROMPT` in `client/services/llmPrompts.ts`. This section summarizes its shape; source code is authoritative. Tables for advanced effect hooks, listener phases, listener scopes, and action IDs render at runtime from truth sources: `cardEffectHooks` in `shared/cards/card-effects.ts`, plus `shared/custom-code/sandbox-hook-meta.ts`, `sandbox-listener-phases.ts`, `sandbox-listener-scopes.ts`, and `sandbox-action-ids.ts`. They cannot drift from the engine and need no manual mirror.

The prompt contains role definition, output format, hard rules, detailed `CARD_IMPL`, the effect-hook table, listeners, ActionFlow types, helpers, readable state and player fields, sandbox limits, balance guidance, a game-rules overview, and few-shot examples.

#### Output format

Every response must include one `typescript` code fence with `CARD_DEF` and `CARD_IMPL` constants and no imports or exports. `CARD_DEF` accepts only object form, never `new MinorImprovement(...)` or `new Occupation(...)`:

```typescript
const CARD_ID = 'CUSTOM_EnglishPascalName'

const CARD_DEF = {
  cardType: 'minor',            // or occupation
  meta: {
    id: CARD_ID,
    name: 'Card Name',          // English, matching built-in style
    deck: 'CUSTOM',
    number: 0,
    desc: ['Effect description; <WOOD> <FOOD> tags unchanged.'],
    cost: { wood: 1 },
    vp: 0,
    implemented: true,
    locales: {
      zh: { name: 'Chinese card name', desc: ['Chinese description'] },
    },
  },
}

const CARD_IMPL = {
  effect: {
    id: CARD_ID,
    onRoundStart: (state, player) => gainLeaf(CARD_ID, { food: 1 }),
  },
  listeners: [
    {
      cardIds: [CARD_ID],
      actions: ['plow'],
      phases: ['after'],
      handler: (context) => ({ flow: gainLeaf(CARD_ID, { clay: 1 }), sourceCard: CARD_ID }),
    },
  ],
}
```

#### Hard prompt rules

- `CARD_ID` starts with `CUSTOM_` and uses English PascalCase.
- `deck` is always `CUSTOM`, `number` is zero, and `implemented` is true.
- `import`, `export`, `require`, `registerCardEffect`, and `registerCardListener` are forbidden.
- Classes, generators, `with`, `eval`, `Function`, `fetch`, and related constructs are forbidden.
- Top-level `name`, `desc`, and `prerequisite` fields are English; `locales.zh` must be complete.
- Even a small revision returns the complete source.

#### Effect hooks in `CARD_IMPL.effect`

Common hooks are `onBuy`, `onRoundStart`, `onRoundEnd`, `onAllWorkersPlaced`, `onReturnHome`, `onHarvestFieldPhase`, `onBeforeEndGame`, and `computeBonusScore`. The source contains the complete list. The normal signature is `(state, player) => ActionFlow | void`; `onBuy` also receives `paymentInfo`.

#### Listener mechanism in `CARD_IMPL.listeners`

Listener phases include `before`, `during`, `immediatelyAfter`, `after`, `computeCosts`, `computeArgs`, `computeReplace`, `isDoable`, `anytime`, and `computeChoiceCandidates`.

Scopes are `player`, `opponent`, and `any`; `shared/custom-code/sandbox-listener-scopes.ts` is authoritative. `shared/custom-code/sandbox-listener-actions.ts` authoritatively lists listener `actions`, shared by the prompt, AST validator, and server and browser manifests. Major and minor improvement purchases both use `improvement`.

#### Available ActionFlow leaf action IDs

The nine IDs are `gain`, `pay`, `bonus-vp`, `bake-bread`, `store-on-card`, `take-from-card`, `push-to-card-stack`, `special-effect`, and `future-meeples`. `SANDBOX_ALLOWED_ACTION_IDS` in `shared/custom-code/sandbox-action-ids.ts` is authoritative. Old IDs such as `pay-resources`, `gain-other-players`, `write-card-extra-data`, and `hold-worker-on-card` are removed.

#### Injected sandbox helpers

Available helpers include `gainLeaf(cardId, {food:2})`, `payLeaf({cardId, cost:{wood:1}})`, `spaceHasPlayer(space, playerId)`, `positionKey({row,col})`, `getCardStack(player, cardId)`, and `readCardExtraData(player, cardId)`.

#### Balance guidance

One food is approximately the weakest benefit. An `onRoundStart` effect repeats and should remain modest. `bonus-vp` is strong and needs a cost or strict condition. A one-time `onBuy` effect may be somewhat stronger.

#### Few-shot examples

The system prompt appends raw Markdown from `docs/community-card-examples.md`, imported through Vite `?raw`, as its few-shot library.

### C3. Multi-turn conversation

- Conversation history and unsent input stay in the current browser session and its localStorage recovery copy.
- Each turn appends user feedback and the LLM response.
- The model sees complete history and can iterate on requests such as lowering a cost, adding a Harvest effect, or following the official Ale Benches style.
- The frontend extracts the last complete source block from each response as an ability candidate; it does not overwrite the adopted source.
- The server stores only the most recently completed ability request and result. It never receives full conversation history, unsent input, or the API key.

### C4. Card artwork generation

The UI collects only an `Image subject`. At request time, it combines that with a fixed template by card type; the complete prompt is neither displayed, uploaded, nor persisted. The template asks for a nearly square portrait composition around 0.95:1, without pixel dimensions, frames, gold borders, or text.

The browser cover-crops the source into the art-window ratio, applies an occupation circle or minor-improvement hexagonal mask, and draws the gold border. Final canvases are 512 by 537 pixels for occupations and 512 by 534 for minor improvements, regardless of the model's output size.

A generated image becomes a candidate rather than replacing current art. The browser session retains at most three candidates. Adoption atomically updates the Design Draft, creates a deduplicated Draft Version, and uploads the image to `/data/card-art/`. The server stores only the user's subject and the adopted candidate's provenance.

### C5. Security validation for LLM-generated code

The model emits TypeScript containing `CARD_DEF`, `CARD_IMPL.effect` callbacks, and `CARD_IMPL.listeners`. The backend validates, compiles, and executes it in a sandbox.

1. **AST validation** in `shared/custom-code/ast-validator.ts` uses the TypeScript Compiler API and rejects:

   - statement-level imports and exports, dynamic `import()`, `require()`, class declarations and expressions, `with`, and generator functions;
   - bare identifiers `eval`, `Function`, `process`, `require`, `globalThis`, `global`, `window`, `document`, `__dirname`, `__filename`, `fetch`, `XMLHttpRequest`, `WebSocket`, `setTimeout`, `setInterval`, `setImmediate`, `clearTimeout`, `clearInterval`, `Deno`, `Bun`, `Proxy`, and `Reflect`;
   - property access through `obj.X` or `obj['X']` for `constructor`, `__proto__`, `__defineGetter__`, `__defineSetter__`, `__lookupGetter__`, and `__lookupSetter__`;
   - `CARD_IMPL.effect` keys outside `cardEffectHooks` and listener phases outside `actionHookPhases`.

   AST validation produces friendly errors; isolated-vm with its separate V8 heap is the real security boundary.

2. **Compilation** in `shared/custom-code/compiler.ts` uses `ts.transpileModule()` to create CommonJS JavaScript. Database column `card_json` holds all custom-code data: `CARD_DEF` metadata, TypeScript source, compiled JavaScript, and manifest. Early v1 through v3 schemas had separate `effect_dsl`, `effect_code`, and `compiled_code` columns from the abandoned V1 DSL; migration v7 dropped them.

3. **Sandbox execution** in `server/custom-code/{engine, executor-worker, isolate-runner, runtime}.ts` uses:

   - the `isolated-vm` package, a separate V8 heap rather than `node:vm`, with no prototype-chain escape, an 8 MB memory cap, and a 100 ms CPU timeout per execution;
   - a Worker Thread in `executor-worker.ts`, so a V8 or native crash kills only the Worker and the main process recreates it;
   - `SharedArrayBuffer + Atomics.wait` for synchronous waiting from the main thread, with a 5,000 ms overall timeout;
   - exception handling that records a warning, returns `null`, and lets the game continue;
   - pure read or leaf-building helpers from `injected-helpers.ts`: `gainLeaf`, `payLeaf`, `spaceHasPlayer`, `positionKey`, `getCardStack`, and `readCardExtraData`.

An early design considered a declarative JSON-only V1 DSL. It was not adopted; production uses LLM to TypeScript, AST allowlisting, and isolated-vm.

---

## D. Workshop architecture

### D1. Custom-card registration

`shared/cards/custom-registry.ts` registers `CustomCardData` in the current `SessionCardContext`. Only tests and explicit global paths use separate fallback maps for minor improvements and occupations. `getMinorImprovementCard()` and `getOccupationCard()` in `shared/cards/catalog.ts` fall back to that registry by card type.

### D2. Loading custom cards into a game

1. Only when the community deck is enabled does the lobby page through reviewed live cards eligible for a real Room via `GET /api/workshop/cards?scope=room`. Room creation sends the selection in WebSocket `createRoom.customCardIds`, and the server accepts those IDs only when `enableCommunityDeck === true`. Author sandboxes continue to use HTTP `/api/game/new-sandbox`.
2. `server/connection/room-router.ts` or `server/game-router.ts` constructs `CustomCardData[]` from the database.
3. The `GameSession` constructor registers definitions and runtime implementations into that game's `SessionCardContext`.
4. `registerExecutorBackedCustomCard()` in `server/custom-code/runtime.ts` injects effect hooks and listeners from compiled output and manifest, delegating to Worker Thread plus isolated-vm through `invokeCustomCodeEffectSync` and `invokeCustomCodeListenerSync`.
5. Add the custom-card IDs to the deal pool.

### D3. Sandbox isolation and fault tolerance

- Every custom-card effect and listener call is wrapped in `try/catch`.
- On failure, record the error, skip the effect, and continue the game. The current sandbox session accumulates deduplicated runtime errors; the Workshop confirmation gate rereads them and rejects the erroneous version before submission.
- isolated-vm has a 100 ms CPU timeout per execution.
- State snapshots can roll back through existing undo infrastructure.

### D4. Workshop UI structure

```text
WorkshopPage
├── CardBrowser          grid browsing, search, sort, and filters
│   ├── CardPreviewTile  thumbnail, name, author, and like count
│   └── Pagination
├── CardDetail
│   ├── CardArt          artwork preview
│   ├── CardStats        cost, points, and description
│   ├── EffectViewer     read-only TypeScript
│   ├── LikeButton
│   ├── CommentSection
│   └── AddToSandbox
├── CardEditor / AiCardDesigner
│   ├── PreviewPanel     always shows the adopted draft
│   ├── StageRail        basics, art, ability, localization, validation, and delivery
│   ├── CandidateReview  compare, validate, adopt, or discard art and ability candidates
│   ├── SaveState        checkpoints, offline recovery, and whole-revision conflict choice
│   └── VersionHistory   immutable restore and one local undo
└── SandboxView
    ├── SelectedCards     selected custom cards
    └── TestGameButton   starts a player-count-configurable test game with custom cards
```

### D5. Workshop-to-GitHub pull-request flow

`submit-review` is the only entry into `in_review`, under PRDs #634 and #637. The GitHub pull request carries review, and review occurs before approval. Entry is on the card detail page:

1. The user must be authenticated and be the Workshop card's author.
2. The card must be `unsubmitted`, `stale`, or `in_review`; submitting again while in review updates the pull-request branch. Quality gates are static validation, `sandbox_pass_version_id` content matching the draft through `getHandoffReadiness`, complete Chinese localization, and a `card_id` not already owned by an approved or merged card.
3. The frontend calls `POST /api/workshop/cards/:id/submit-review`.
4. If the server lacks a GitHub token for the current session, it returns an OAuth start URL. The frontend opens a popup and waits for the callback page to send `postMessage({ type: 'workshop-pr-oauth', ... }, '*')`.
5. After authorization, the frontend retries. The server creates or updates a branch and opens or updates a pull request, then `enterReview` changes the card to `in_review` and freezes the head SHA and Draft Version. One pull-request URL binds to one card. Reuse is limited to an open, nondraft PR on the same branch with `main` as base. Closed or merged PRs remain history; resubmission creates a new PR. An old open PR that is draft or targets another base is closed before creating an eligible PR. After binding, the server rereads current review state to cover an earlier approval webhook. A temporary read failure does not roll back the established PR or binding; it clears synchronization time and the existing `refresh-pr-status` entry retries reconciliation.
6. The Workshop Review GitHub App receives `pull_request_review` and `pull_request` webhooks. After signature verification and delivery deduplication, an approved review requires an atomic GraphQL snapshot. If `authorAssociation=OWNER` and there is no `CHANGES_REQUESTED`, the provider synthesizes a head-bound owner approval to accommodate GitHub's ban on self-approval. An ordinary author still needs approval from a reviewer with push access. A changed head, closed or draft PR, base changed away from `main`, dismissed valid approval, or `CHANGES_REQUESTED` makes the card `stale·offline`. Unbound or ambiguous PRs do not query GitHub. Potentially out-of-order events reread current state and commit only if the review binding, lifecycle, and timestamp remain unchanged. A late review event for a PR merged into `main` retains its same-head binding; a PR merged elsewhere receives no exception and counts as closed without merge. If GraphQL is unavailable, record delivery and conservatively take the card offline without overwriting an already recorded close. Comment-only review changes nothing.
7. On author publish, the server queries GraphQL again. It sets live only if the PR is open, nondraft, based on `main`, has valid reviewer or owner approval, and the review commit, PR head, platform-approved commit, pinned version, and before-and-after live-state token all agree.

Core server modules are:

| Module | Responsibility |
|---|---|
| `server/workshop-pr/propose-handler.ts` | Orchestrates permissions, upstream file reads, generated files, and commit, branch, and pull-request creation |
| `server/workshop-pr/oauth-handler.ts` | GitHub OAuth start and callback, requesting `repo` for private upstream support |
| `server/workshop-pr/github-client.ts` | GitHub REST adapter; when the authorized user owns upstream, pushes a branch directly without a fork |
| `server/workshop-pr/code-gen.ts` | Pure generator from Workshop card to community Card Source, registries, and documentation |
| `server/workshop-review/github-review-provider.ts` | GitHub App installation token and atomic GraphQL review snapshot |
| `server/workshop-review/webhook-handler.ts` | `/api/github/webhook` signature verification, delivery deduplication, and review approval or invalidation |
| `client/services/workshop-pr.ts` | Frontend submit-review and OAuth popup helper; resolves a relative auth URL against backend `VITE_API_BASE` |

Every generated pull request contains:

| File | Purpose |
|---|---|
| `shared/cards/community/{CUSTOM_ID}.ts` | Card Source with UI metadata and `CardImpl` |
| `shared/cards/register-all.ts` | Registers `{CUSTOM_ID}.impl` |
| `shared/cards/catalog.generated.ts` | Definition catalog |
| `docs/community_cards.md` | Community index, amended after PR creation with the real pull-request number |
| `public/card-art/community/{CUSTOM_ID}.{ext}` | Optional artwork binary |

The generator creates no definition or export-shape smoke test. A simple immediate-resource effect uses a direct behavior test. Payment, choice or pending, delayed, cross-player, and multistep flows require a dedicated `GameSession` scenario written by the author, reviewer, or LLM.

Necessary normalization prevents a sandbox-valid card from failing pull-request CI:

- Change `deck: 'CUSTOM'` to `deck: 'community'`.
- Add the `CardImpl` context type to `CARD_IMPL`, preventing listener phase and action literals from widening to `string[]`.
- Give a listener without `id` the stable `{cardId}-listener-{n}`.
- Convert `prerequisite: { occupation: N }` into supported `prerequisite: 'N Occupations'` plus `occupationPrerequisites: { min: N }`.
- Update `register-all.ts`; `pnpm run generate:register-all` generates base, major, and community metadata into `catalog.generated.ts` and `major/generated.ts`.

### D6. Card detail, version history, and editor hydration

The detail URL is `?page=workshop&card=<workshop-card-id>`. Opening a card uses `pushState`; returning to the list or switching home uses `replaceState`. A `popstate` listener supports browser navigation.

The editor deep link is `?page=workshop&view=editor&card=<workshop-card-id>`. It loads the author's private `GET /api/workshop/cards/:id/workspace` directly; a public detail endpoint containing only published projection cannot hydrate a draft.

Version history comes from `GET /api/workshop/cards/:id/versions`, and players see the latest five versions. Creating a version prunes older versions beyond the limit unless review, publication, or sandbox confirmation pins them. Restore calls `POST /api/workshop/cards/:id/restore` with `baseRevision`, copies the immutable version into the current Design Draft, and advances revision. It neither rewrites history nor creates another version. The browser retains the pre-restore draft for one local undo.

### D7. Design Draft persistence and commands

`server/workshop-drafts.ts` is the write boundary for the Workshop Card aggregate. It centralizes revision, version deduplication, public projection, exact-version sandbox confirmation, and PR handoff readiness. HTTP handlers own only authentication, parsing, and response mapping.

| Command | Meaning |
|---|---|
| `POST /api/workshop/cards` | Create a complete new card with name and a unique legal `CUSTOM_` ID; never update or publish an existing card |
| `PUT /api/workshop/cards/:id/draft` | Save a complete checkpoint with `baseRevision`; stale input returns `409` and the complete server draft |
| `POST /api/workshop/cards/:id/adopt` | Atomically adopt a typed candidate, create a content-deduplicated version, and clear candidates of that type |
| `POST /api/workshop/cards/:id/restore` | Copy an old version to the current draft and advance revision without creating a version |
| `POST /api/workshop/cards/:id/publish` | Make only a review-approved card live; revalidate the atomic GraphQL snapshot at publish, rejecting and marking stale on provider disagreement |
| `POST /api/workshop/cards/:id/unpublish` | Move live to offline without invalidating approval; an unchanged card can be republished under #638 |
| `POST /api/admin/cards/:id/takedown` | Administrator kill switch under #641: force `stale·offline` and terminate every active game embedding the card, without scoring or completed Replay |
| Webhook `pull_request` closed and merged | Graduate under #642 only when merged into `main`: enter terminal `merged`, serve the snapshot through the release gap, then switch to built-in on release. A merge to another base counts as unmerged closure and becomes `stale·offline` with `closed`. If merge arrives before approval, persist the merge fact; a later approval webhook or `refresh-pr-status` can graduate from an approved MERGED snapshot with frozen head and valid SHA binding, then reconcile built-in status immediately. |
| `POST /api/workshop/cards/:id/pin-version` | Freeze the current draft as an immutable version for sandbox confirmation without changing review state |
| `POST /api/github/webhook` | Verify GitHub App HMAC and handle submitted or dismissed reviews and PR synchronize, edit, draft conversion, or close with idempotent delivery |
| `POST /api/workshop/cards/:id/sandbox-pass` | Record author confirmation only for the exact current publishable version with no runtime errors |

First ability generation and regeneration include current card context. `CARD_ID`, card type, and name remain fixed and are revalidated by the Workshop Card aggregate at adoption. Other definition fields, including description, cost, VP, and localization, may change with a candidate.

Every ability-source validation writes the isolated-vm-extracted `CARD_DEF` snapshot into the server manifest. The publication static gate compares its deliverable fields bidirectionally with current `card_json`. PR handoff also requires validated source, preventing divergence among sandbox execution, published definition, and submitted source.

Ordinary editing creates checkpoints only on stage change, in-site navigation, or explicit save; it creates no Draft Version. Refresh and crash recovery use a synchronously written localStorage copy. If its revision matches, it recovers as unsynchronized. If the server revision advanced, the user chooses the complete server or complete local draft.

A Draft Version serializes only final card content and provenance for adopted candidates in each section. Image provenance retains the user's subject at the same level so image regeneration remains possible after restoration. Temporary `_draft` fields, unadopted candidates, complete generation-result copies, and working conversations do not enter versions.

---

## E. Security design

| Threat | Control |
|---|---|
| API-key exposure | Store only in localStorage, never send to the game server, and label this clearly in the UI |
| Password exposure | Hash with `crypto.scrypt`; never store plaintext |
| Session hijacking | HTTPS in production plus HttpOnly, Secure, SameSite session cookies |
| Brute force | Rate-limit login to five attempts per minute per IP |
| Malicious card code | AST allowlist blocking imports, exports, eval, process, fetch, timers, Proxy, Reflect, classes, and more; isolated-vm with a separate V8 heap; Worker Thread; 100 ms and 8 MB limits; rollbackable snapshots |
| XSS through card text | React's default HTML escaping; never `dangerouslySetInnerHTML` |
| Unauthenticated WebSocket | Prefer session-cookie validation; otherwise require an auth message within five seconds or disconnect |

---

## F. Added dependencies

| Dependency | Purpose | Notes |
|---|---|---|
| `better-sqlite3` | SQLite | Synchronous API matching existing style |
| `@types/better-sqlite3` | Types | Development dependency |
| `nanoid` | Short IDs | User, card, and Room IDs |

No other dependency is needed. `crypto.scrypt` and `crypto.randomUUID` are built into Node.js.

---

## G. Implementation phases

### Phase 1: Database and authentication

- Add `better-sqlite3` and initialize schema in `server/db.ts`.
- Create `server/auth.ts` for registration, login, and sessions.
- Add authentication middleware to `server/index.ts`.
- Create `client/app/LoginPage.tsx` and `AuthContext`.
- Migrate Room persistence from JSON files to SQLite.
- Add the WebSocket authentication handshake.

### Phase 2: Lobby

- Create `client/app/LobbyPage.tsx`.
- Add lobby APIs.
- Replace direct rendering in `App.tsx` with `PageRouter`.
- Add Room list, create, and join UI.

### Phase 3: Workshop with data-driven cards

- Add Workshop APIs.
- Add `shared/cards/custom-registry.ts`, AST validation under `shared/custom-code/`, and isolated-vm execution under `server/custom-code/`.
- Create Workshop browse, edit, and sandbox UI.
- Add likes and comments.

### Phase 4: LLM card designer

- Aggregate Gemini, OpenRouter, DeepSeek, and AiHubMix under `client/services/llm/`.
- Add the system prompt template.
- Add conversational design UI.
- Add card-art generation.

### Phase 5: Advanced card effects, merged into Phase 3

- TypeScript AST validation in `shared/custom-code/ast-validator.ts`.
- isolated-vm plus Worker Thread crash isolation.
- Full support for `CARD_IMPL.effect` hooks and `CARD_IMPL.listeners`.

---

## H. Key files

- HTTP, authentication, and database: `server/index.ts`, `server/auth.ts`, `server/db.ts`.
- WebSocket: `server/connection/{ws-server,room-router,broadcaster}.ts`.
- Rooms and persistence: `server/game/{room,room-registry,room-committer,room-persistence-checkpoint}.ts` and `server/game/persistence/`.
- Protocol: `shared/contract/protocol/ws.ts`.
- Workshop and sandbox: `server/workshop.ts`, `server/game-router.ts`, `shared/cards/{custom-registry,catalog}.ts`, `shared/custom-code/`, and `server/custom-code/`.
- Frontend platform: `client/app/{LoginPage,LobbyPage,WorkshopPage,PageRouter}.tsx` and `client/contexts/AuthContext.tsx`.
- Browser LLM: `client/services/llm/`.

---

## I. Verification

- **Authentication:** register and verify email or use OAuth; check the HttpOnly cookie; refresh and remain signed in.
- **Lobby:** create a Room, join from another browser, and start the game.
- **Persistence:** refresh midgame and restore; restart the server and restore again.
- **Workshop:** create and publish a custom card; browse, like, and comment as another user; add it to a sandbox.
- **LLM design:** enter an API key, describe a card, preview it, iterate, and save.
- **Sandbox:** select custom cards, create a test game, and verify their effects fire.
- **Security:** use the browser Network panel to confirm that the API key appears in no request.

---

## J. Implementation status on `main`

Last updated 2026-07-29.

### Complete

| Feature | Files |
|---|---|
| Registration, login, logout, session validation, email verification, and OAuth | `server/auth.ts`, `server/auth-cookies.ts`, `server/oauth/`, `client/app/LoginPage.tsx`, `client/contexts/AuthContext.tsx` |
| SQLite and migrations | `server/db.ts` |
| WebSocket authentication | `server/connection/ws-server.ts`, `server/connection/room-router.ts`, `shared/contract/protocol/ws.ts` |
| WebSocket Room writes to SQLite | `server/game/room-persistence-checkpoint.ts`, `server/game/room-committer.ts`, `server/game/persistence/sqlite-adapter.ts` |
| Room recovery after server restart | `server/connection/ws-server.ts`, `server/game/persistence/sqlite-adapter.ts` |
| JSON or SQLite game-state persistence | `server/game/persistence/`, selected by `PERSIST_ROOMS` |
| Completed-result archive and full-state removal | `server/game/room-persistence-checkpoint.ts`, `server/game/persistence/sqlite-adapter.ts` |
| Room TTL expiry | `server/connection/ws-server.ts`, `server/game/persistence/sqlite-adapter.ts` |
| Lobby | `client/app/LobbyPage.tsx`, `/api/lobby/my-rooms` |
| Page routing through `?page=` | `client/app/PageRouter.tsx` |
| Live URL-parameter reads | `client/app/GameContainerApi.tsx`, moved out of module scope |
| Return-to-lobby button | `client/components/header/GameHeader.tsx` |
| Development mode off by default | `client/app/GameContainerApi.tsx`, enabled with `?devMode=1` |
| Automatic logout on authentication 401 | `client/contexts/AuthContext.tsx`, `apiFetch` |
| In-game name synchronization with the authenticated user | `shared/session/session-core.ts`, `server/connection/room-router.ts`, `server/game-router.ts` |
| Workshop card CRUD | `server/workshop.ts`, `client/app/WorkshopPage.tsx` |
| Workshop likes and comments | `server/workshop.ts` |
| Workshop sandbox | `server/workshop.ts`, WorkshopPage SandboxView |
| Custom-card registry and catalog fallback | `shared/cards/custom-registry.ts`, `shared/cards/catalog.ts` |
| Custom-card `try/catch` resilience | `shared/cards/card-effects.ts`, skipping failures for `CUSTOM_` cards |
| Player-count-configurable sandbox game with custom cards | `/api/game/new-sandbox`, `server/game-router.ts` |
| Custom cards in multiplayer WebSocket games | `shared/contract/protocol/ws.ts` `createRoom.customCardIds`, `server/connection/room-router.ts` |
| LLM card designer | `client/app/workshop/AiCardDesigner.tsx`, `client/services/llm/` |
| Multiple LLM providers | Gemini, OpenRouter, DeepSeek, and AiHubMix; see section C1.1 |
| Browser-isolated API keys | Stored in localStorage and never sent to the server |
| Card-art generation and upload | Gemini, OpenRouter, and AiHubMix image models, `POST /api/workshop/art`, and `/card-art/` static service |
| Resource-icon parsing | `client/components/common/ResourceText.tsx` |
| Authentication and Workshop unit tests | `server/__tests__/auth.test.ts`, `workshop-api.test.ts` |
| TypeScript AST validation and isolated-vm sandbox | `shared/custom-code/ast-validator.ts`, `server/custom-code/{compiler, engine, client, executor-worker, isolate-runner, runtime, injected-helpers}.ts` |
| Card version history | `workshop_card_versions`, versions and restore APIs, and the WorkshopPage version panel |
| Featured Workshop page | `workshop_cards.featured`, administrator toggle, and Featured tab |
| Production deployment with Docker and GitHub Pages | `Dockerfile`, `docker-compose.prod.yml`, `deploy-backend.sh`, `.github/workflows/deploy-pages.yml`, `client/config.ts` |
| Administrator role | `server/auth.ts` `isAdmin()`, `ADMIN_USERS` |
| Administrator APIs | `GET/DELETE /api/admin/cards`, `GET /api/admin/cards/:id/export`, `GET /api/admin/users`; PRD #634 removed the self-certified status toggle |
| Card publish and unpublish | PR-gated under PRD #634: a GitHub App GraphQL decision pins the reviewed version; author publish revalidates before setting live; nonauthors see only live cards |
