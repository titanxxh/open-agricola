# Open Agricola Platform Expansion: Design and Evolution

[English](PLATFORM_DESIGN.md) | [中文](PLATFORM_DESIGN_zh.md)

## Context

The project has grown from a standalone game engine into a complete platform with accounts, a game lobby, database persistence, and a Card Workshop with LLM-assisted design, while retaining backend authority.

Sections A through G record the original choices and later evolution. SQL and route fragments are illustrative; section J lists current implementation status and entry points, while source code defines runtime behavior.

---

## A. Architecture choices

### A1. Database: asynchronous PostgreSQL with private S3 resources

`server/database/schema.sql` and numbered migrations define the runtime schema. `server/db.ts` uses an asynchronous `pg` pool. Transactions retain one connection across awaits; nested transactions use serialized savepoints. Startup applies migrations under a shared advisory lock.

Accounts, OAuth, Workshop, Bug Reports, Rooms, Game Contexts, Replays, results, placement, command receipts, invalidation barriers, and task claims use PostgreSQL. Case-insensitive unique identities use `citext`. Recovery encodings stay exact TEXT and compressed Replay payloads stay BYTEA; JSONB must not re-encode bytes used by integrity checks.

Artwork, content-addressed Replay assets, and immutable Viewers live in private S3. PostgreSQL owns staging, references, and GC claims. The independent S3 erasure ledger is merged with current external copies before restoration. Application-container files are not authoritative resource storage.

Docker Compose provides PostgreSQL 18 and RustFS on one host without an external service account. SQLite is only a read-only, one-time input to `scripts/import-sqlite.ts`. Import preserves recorded games and unrelated data and discards only proven unrecorded active games. Failed import or target-build validation blocks application startup. See [deployment instructions](HOW_TO_DEPLOY.md) for migration and backup commands.

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
- `?transport=ws&hotseat=1&...`: local hotseat — an ordinary authoritative room whose seats all belong to one device, so it persists and restores like any other room, is hidden from the lobby list, and only its creator can rejoin;
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

### B1. One public entry, one application by default

`server/ingress.ts` preserves the backend origin and OAuth callbacks, routes `/nodes/<instanceId>/ws` to the current Room owner, and provides HTTP Workshop sandbox affinity. `scripts/local-backend.ts` starts one application process by default; `APP_INSTANCES=2` exercises two processes on one host. PostgreSQL owns the directory, leases, owner epochs, write/publication fences, and command receipts. GameSession remains the sole rule-state writer.

### B2. Development

`./restart-local.sh` prepares or reuses local PostgreSQL, private S3, schema, and an immutable Viewer. Worktrees share their main checkout's dependency data by default. Restart preserves that data. Use `./restart-local.sh --instances 2` for two local applications. `pnpm run verify` uses the same launcher with a separate test schema, S3 prefix, ports, and logs.

All hosted Rooms record, including ordinary, Workshop, hotseat, and development Rooms. A development slot points at a fresh permanent Room ID after rematch/reset; the launcher prints current links. Earlier Game Context identities are never reused. Standalone HTTP/browser Workshop Sandboxes remain available.

### B3. Single-host deployment and later service migration

The production image includes native PostgreSQL backup tools and an immutable Viewer, published to S3 at startup. Caddy retains the existing HTTPS origin. Application processes and dependency ports stay private. PostgreSQL and S3 have independent persistent volumes; cloud accounts are optional.

External `DATABASE_URL` and complete `S3_*` settings can be supplied later. Move data during maintenance, preserve encryption keys, merge current erasure facts, and validate recovery with the target build before activation. Configuration changes alone never migrate data. Normal one-host/two-instance checks are not fault-recovery, 30-second recovery, or capacity certification.

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
| OpenRouter | `deepseek/deepseek-v4.1-flash` | DeepSeek V4.1 Flash | No | Yes | No | DeepSeek chat through OpenRouter |
| OpenRouter | `deepseek/deepseek-v4-pro-0813` | DeepSeek V4 Pro (0813) | No | Yes | No | DeepSeek chat through OpenRouter |
| DeepSeek | `deepseek-flash` | DeepSeek V4.1 Flash | Yes | Yes | No | Official DeepSeek API |
| DeepSeek | `deepseek-v4-pro` | DeepSeek V4 Pro (0813) | No | Yes | No | Official API; display final content but not reasoning content |
| AiHubMix | `gemini-3.1-flash-image-preview-free` | Gemini 3.1 Flash Image (Free) | No | No | Yes | Free AiHubMix image model |
| AiHubMix | `coding-glm-5.1-free` | Coding GLM 5.1 (Free) | Yes | Yes | No | Free AiHubMix chat model |
| AiHubMix | `k2.6-code-preview-free` | K2.6 Code Preview (Free) | No | Yes | No | Free AiHubMix chat model |

DeepSeek names were verified on 2026-10-08 against the [official model list](https://api-docs.deepseek.com/quick_start/pricing/) and [OpenRouter catalog](https://openrouter.ai/api/v1/models). The official Flash API uses `deepseek-flash` for V4.1 Flash; its retired `deepseek-v4-flash` name is only a temporary forwarding alias. The current Pro is V4 Pro 0813: its official ID remains `deepseek-v4-pro`, while OpenRouter requires the `-0813` suffix because its unsuffixed Pro still identifies the older 0423 checkpoint. Both support thinking; image understanding does not imply image generation.

OpenRouter has no provider-level fallback `chat` or `image` capability. Every model declares its own capabilities so image UI never shows chat-only models and chat UI never shows image-only models.

#### C1.2 Browser tool loop

The production editor uses the browser runner under `client/services/llm/generation/`; the text-only ability path has been removed. The model table above lists existing UI registrations, not verified tool-calling combinations.

A **Generation Attempt** encompasses reference queries, model responses, and bounded repairs. Pausing and continuing preserves its model configuration, reference commit, and cumulative accounting; cancelling does not produce a completed candidate from partial output. Each new attempt resolves the latest GitHub `main` and pins that commit for its reference reads. Reference content is independent of site releases, while executable code must still obey the actual Custom Code Sandbox capabilities. LLM credentials remain browser-to-provider only. The logged-in browser reads main and pinned tree metadata through `GET /api/workshop/references/main` and `GET /api/workshop/references/tree/:sha`. The backend uses a project-owned GitHub read credential, fixes the repository and operations, bounds responses, and projects only commit/tree fields. It never receives model credentials or executes the model loop. Source text still comes directly from anonymous `raw.githubusercontent.com` requests and is verified against the pinned blob hash; nothing is bundled with a site release. Main is never cached or replaced by a stale fallback. Missing project credentials, inaccessible GitHub metadata or an incomplete tree pause generation.

Uncached metadata reads spend shared PostgreSQL budgets before acquiring a project token: 20/minute and 120/hour per authenticated user, plus 100/minute and 1,000/hour across the site. Rejected user requests do not spend the global allowance. GitHub cooldowns are shared across backend instances and returned as `429` with `Retry-After`; each process also caps concurrent upstream reads at three. Tree requests accept only commits confirmed by a successful main read within the last hour, checked before serving a cached tree. A retry after main succeeds keeps that SHA. Already initialized reference sessions retain their tree and continue reading the same SHA's raw text after the authorization window; they do not re-resolve main.

The runner allows eight model requests, 24 reference calls and five active minutes initially; explicit continuation adds that allowance without resetting counts or the reference commit. It has one model POST in flight, at most three concurrent reference reads, two transient reference HTTP retries and at most two static repairs. EOF, truncated output, provider errors and cancellation never complete partial source. A failed POST pauses for explicit retry; a validation-service failure retries validation, not the model. Provider reasoning/signatures remain in page-memory protocol history. Streaming limits distinguish 32 MiB of cumulative SSE transport from 2 MiB per event and per decoded message, so repeated frame metadata does not prematurely truncate an allowed 16,384-token response.

Reference tools search allowed paths and text of files already fetched (not GitHub-wide full-text search), then read at most 160 numbered lines and 16 KiB per serialized result from files up to 256 KiB. Cached-text matches and Markdown section headings provide line numbers for targeted jumps; pagination does not require reading the entire file. The prompt explains the request allowance; each browser turn adds a separate execution-status message with remaining requests and repairs after complete tool groups, so the model can finish once the needed contract is established. Reads verify the Git blob hash. Main is resolved afresh for each attempt; same-commit trees and text may be cached. A 192 KiB request-context limit stops the attempt without silently dropping protocol fields. Exact provider/endpoint/model admission is enforced in the transport. The tested `deepseek` / `https://api.deepseek.com/v1/chat/completions` / `deepseek-flash` request tuple is admitted; all other combinations remain pending.

The last model request in each allowance retains the tool definitions but uses `tool_choice: none`, reserving a response slot. It may return complete source or a justified clarification/capability gap. If an essential reference fact remains unresolved, `reference-continuation` pauses for explicit additional allowance, preserving the checkpoint; it is not a Generation Result or an adoptable candidate. Browser execution status uses host `system` messages rather than fabricated user requests. Keeping tool definitions is required for DeepSeek to retain prior reasoning in context, as described in its [thinking-mode contract](https://api-docs.deepseek.com/guides/thinking_mode/); the [Chat Completions contract](https://api-docs.deepseek.com/api/create-chat-completion/) supports `none` in thinking mode.

The decisions live in [the reference contract](https://github.com/titanxxh/open-agricola/issues/1032) and [model admission, loop boundaries, and recovery](https://github.com/titanxxh/open-agricola/issues/1033). These records define the initial budgets, explicit continuation, limited retries and repairs, and browser tool-roundtrip evidence required before enabling a model.

#### C1.3 Request/result and draft recovery

The approved [request/result contract](https://github.com/titanxxh/open-agricola/issues/1034) makes follow-up requests use the selected ability candidate, or the adopted draft when none is selected. Error repair binds to the source and card identity read from the pinned version that actually failed. The pin response includes the stored immutable version snapshot, including when content deduplication reuses a version outside the five-item history list. Missing pinned identity or a changed card ID, type or name rejects repair before creating a model transport; the author must pin and playtest the current version again. Shared request construction captures card identity, the user's goal, source and input fingerprints, and the relevant visible conversation. Repair inputs contain the tested source once in `input.source`; the intent retains only its error and version metadata. New requests resolve the latest reference commit; automatic validation repairs and explicit continuation stay within the same attempt. Sandbox playtest errors start a new attempt only when the author clicks **AI repair**.

A **Generation Result** can contain a complete source candidate, failed source retained for repair, a clarification, a capability gap, or a failure/interruption summary. Failed source cannot be adopted and does not replace the latest candidate that passed code validation. Partial output is not a completed source candidate. Source and input fingerprints bind asynchronous results and validation responses to the content they describe; old responses cannot silently replace newer work.

| Storage boundary | Recovery |
|---|---|
| Current browser page | Complete tool protocol, reference bodies, and provider reasoning/signatures; no continuation across a page reload |
| Same-browser local recovery | Visible conversation and existing editing state; unfinished work is marked interrupted and never resumes automatically |
| Author-private server draft | Adopted draft content, latest ability candidate that passed code validation, latest Generation Result, and compact Generation Provenance; no complete conversation or raw tool protocol |

The latest result and candidate may reference the same source without retaining duplicate completed copies. Adoption remains explicit and server-validated. Draft Versions retain only adopted content and its allowlisted provenance; identical content continues to reuse an immutable version without rewriting its original provenance. Public card, submission, and Replay projections exclude private generation records. The shared allowlist in `shared/projections/workshop-generation.ts` now protects checkpoint, adoption, version provenance and local recovery. The ability group stores `lastValid` and `latestResult` separately; successful results reference the candidate by ID and source fingerprint, while a failed result retains its complete non-adoptable source. Local chat recovery projects only visible fields and marks in-flight work interrupted. Pending ability, failed-source and art candidates retain their original base revision and stale marker through checkpoints and reloads. A manual source edit clears model provenance and requires fresh code and identity validation before adoption. A failed revalidation replaces the earlier validation of that exact candidate/source. Adoption clears all pending candidates of its type, including retained failed source, while keeping the compact latest-result summary. The editor uses these projections for generation, explicit adoption and recovery.

`GET /api/workshop/sandbox-contract` exposes the actual deployed helper source, hook/listener metadata, supported action shapes, isolation limits and semantic restrictions. Its identifier hashes deployed shared/executor source, the resolved dependency lockfile and runtime versions, independently of the GitHub reference commit. `POST /api/workshop/cards/validate-code` binds success and failure to that identifier and the submitted source fingerprint; an obsolete contract returns `sandbox_changed` so a new attempt is required. The main browser receives data only, never imports the rule runtime.

#### C1.4 Quality and cost acceptance

The [acceptance decision](https://github.com/titanxxh/open-agricola/issues/1035) admits models individually after browser protocol and card-behavior verification, starting with the configured DeepSeek Flash combination. The approved batch compares 17 scenarios, repeated three times in each arm, with the [cumulative paid-call budget now authorized at US$20](https://github.com/titanxxh/open-agricola/issues/1035#issuecomment-6052008674); earlier batches retain their original budget snapshots. Every new-architecture run must pass its behavior or capability-gap assertions; first-output quality, repairs, tokens and elapsed time remain visible. The [LLM test guide](test/llm-card-gen.md#browser-tool-acceptance) specifies the matrix and evidence requirements. `scripts/llm-acceptance.ts` implements the browser probe, fixed 102-task batch, original-source behavior checks and persistent US$20 budget shared across batches, preserving earlier costs and unknown-usage reservations. The [2026-10-08 paid acceptance](test/llm-card-gen.md#completed-paid-acceptance) completed all 102 runs on prompt v13 and authenticated metadata tools v5: the new arm passed 48/48 source behaviors and 3/3 capability gaps, with 51/51 first-output passes and 0 static repairs; the control passed 48/51. The admitted request name is the canonical `deepseek-flash`; the old forwarding alias and other exact tuples remain pending. Measured quality, usage, latency and the complete effort's $6.451331556 budget commitment, including earlier failures and unknown-usage reservations, remain in the evidence. Synthetic runs do not admit a model.

#### C1.5 Editor interactions

The author accepted the [interaction prototype](https://github.com/titanxxh/open-agricola/issues/1036) on 2026-10-08. Its ten guided scenarios establish the following presentation requirements for the production workshop:

- Show the target of the next ordinary request separately from the source fixed when the current attempt began. An adoption action names its candidate and version. Code-validation status and actual playtest results have distinct labels.
- Show the current generation stage, cumulative model requests, reference queries and repair counts. When paused, explain the reason, preserve the last complete progress, and state the additional allowance before the author continues the same attempt. Continuing and starting a new attempt remain distinct actions.
- Keep the latest valid candidate and a later failed source separately inspectable; the failed source has no enabled adoption action. Clearly label partial, interrupted and stale results so they cannot be mistaken for a newly usable candidate.
- Present a capability gap or clarification separately from a connection or reference-query failure. Model availability distinguishes admitted combinations from those awaiting verification. Reference sources and useful diagnostics are available on demand; provider reasoning and signatures are not ordinary chat content.
- A playtest error identifies the source actually tested and offers an explicit **AI repair** action. Restored unfinished work says it was interrupted, with no automatic request or protocol continuation after reload.

The original single-file artifact remains on the separate `prototype/llm-tool-loop-interaction` branch; its commit, path and browser observations are recorded in the decision issue. It uses simulated responses and source summaries, and does not prove model admission, rule behavior or production persistence. The guided scenario controls and reducer are disposable prototype assets. `WorkshopAbilityPanel` implements these interactions using the production request/result contracts. Playtest repair reads the exact pinned version source and checks the active sandbox binding; it never substitutes the selected candidate.

### C2. System prompt design

The compact prompt lives in `client/services/llm/generation/prompt.ts`. It defines the task, immutable input, reference tools, trust boundary and output formats, then includes the actual deployed sandbox contract. The contract derives hook/listener/action metadata from their shared truth sources and supplies exact injected helpers. Runtime identity and reference commit remain separate.

The descriptor includes the ActionFlow node grammar and the distinction between engine-scheduled future rewards and resources stored on a card. Inspectable malformed composite flows fail static validation before play, using the same bounded repair path as other compilation errors; this is not a full type or behavior proof.

Examples and detailed reference documents are fetched from GitHub on model request, at the attempt's fixed commit. No repository corpus is bundled into the site prompt. The frozen previous prompt is retained only in `tests/llm-card-gen/control/full-prompt.txt` for acceptance comparisons; product code cannot select it.

#### Output format

A source response must include exactly one complete `typescript` code fence with `CARD_DEF` and `CARD_IMPL` constants and no imports or exports. `CARD_DEF` accepts only object form, never `new MinorImprovement(...)` or `new Occupation(...)`:

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

Clarifications and capability gaps instead return a structured JSON object with `kind` and `message`, without source.

#### Hard prompt rules

- `CARD_ID` starts with `CUSTOM_` and uses English PascalCase.
- `deck` is always `CUSTOM`, `number` is zero, and `implemented` is true.
- `import`, `export`, `require`, `registerCardEffect`, and `registerCardListener` are forbidden.
- Classes, generators, `with`, `eval`, `Function`, `fetch`, and related constructs are forbidden.
- Preserve supplied identity and names. Rule descriptions and prerequisites use English with complete `locales.zh`; editing retains existing bilingual metadata unless explicitly changed.
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

The model reads relevant numbered ranges from `docs/community-card-examples.md` on GitHub. Executable reference examples retain Session tests in `server/__tests__/workshop-prompt-runtime.test.ts`.

### C3. Multi-turn conversation

The browser captures up to 12 relevant visible messages and the exact selected/adopted source. Earlier code blocks are omitted from conversational context because the explicit source is authoritative. Resend starts a new attempt with current card context and a newly resolved reference commit. Tool messages, reasoning and signatures stay only in the active page and are never restored after reload.

Complete validated output becomes a reviewable candidate. Exactly two automatic static repairs are allowed; service failures pause their current step. Failed full source stays editable while the latest valid candidate remains available. The server stores the private compact recovery projection described in C1.3, never the conversation or LLM key.

### C4. Card artwork generation

The UI collects only an `Image subject`. At request time, it combines that with a fixed template by card type; the complete prompt is neither displayed, uploaded, nor persisted. The template asks for a nearly square portrait composition around 0.95:1, without pixel dimensions, frames, gold borders, or text.

The browser cover-crops the source into the art-window ratio, applies an occupation circle or minor-improvement hexagonal mask, and draws the gold border. Final canvases are 512 by 537 pixels for occupations and 512 by 534 for minor improvements, regardless of the model's output size.

A generated image becomes a candidate rather than replacing current art. The browser session retains at most three candidates. Adoption atomically updates the Design Draft, creates a deduplicated Draft Version, and uploads the image to private object storage through `/api/workshop/art`. The server stores only the user's subject and the adopted candidate's provenance.

Managed artwork uses `/card-art/{filename}` identifiers. Historical absolute HTTP(S) URLs and API base-path prefixes (such as `/agricola-api`) resolve to the same local object key for submission, Replay archival and durable references; their host is never fetched. Reads still require the local catalog, matching content hash and erasure checks. Drafts, saved candidates and pinned versions retain their images across API-origin changes. Migration backfills references only for surviving ready objects without rewriting snapshot contents. Already collected images require recovery of their exact recorded bytes and references; removed images remain blocked.

Workshop thumbnails, adopted/candidate previews and custom card faces resolve managed images against the current API base at render time, preserving saved URL values and snapshot hashes. Generation references come only from artwork `resultUrl` and `referenceImages` fields; subject, prompt and ability text remain prose even when they contain image URLs.

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

`submit-review` is the only entry into `in_review`. The public source repository uses one Workshop GitHub App for submission, review reads and signed webhooks. Login OAuth and the issues-only Bug Report App remain independent.

1. Require the signed-in card author, a non-live editable draft, static validation, exact-version sandbox confirmation, Chinese localization, and an available card ID.
2. `POST /api/workshop/cards/:id/submit-review` freezes the Workshop Card, Draft Version, revision, App installation, repository and `workshop/<card database ID>/<proposal ID>` branch in PostgreSQL before any remote write. Card Source and PR text retain the designer's name; GitHub authorship belongs to the App. Unadopted candidates, generation provenance and credentials are excluded.
3. Generate the card, art and shared indexes against current main. Publish with GraphQL `updateRefs(beforeOid, afterOid, force:true)`: the expected head is an atomic condition. Never use an unconditional force update. Only generated paths and independent `server/shared/**/__tests__/*.test.ts` edits are admitted; workflows and unrelated changes require maintainer integration.
4. Reuse only the same open, non-draft, main-targeted PR. Compare every previously generated file with the saved baseline before regenerating; any reviewer edit, deletion or rename pauses the operation. Preserve independent test patches against latest main; conflicts pause. Draft or retargeted PRs pause. A closed PR requires explicit `action:restart`; a merged PR follows built-in takeover. Never close, reopen or rewrite an old fork automatically. PR text retains the first-submission designer credit and links to the current description/attribution in the generated card header. These fields update atomically with the branch, so the App never rewrites a shared PR body or overwrites concurrent reviewer notes/checklist edits. GitHub does not support conditional PR-body writes ([API guidance](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api#use-conditional-requests)).
5. `SubmissionStore` owns durable checkpoints, one pending operation per card, expiring execution leases and fenced local writes. The worker reconciles up to five due operations every 15 seconds, with at most four automatic attempts and exponential backoff starting at 30 seconds. GitHub rate-limit hints extend this delay. New operations cost one per author per ten minutes and at most twenty globally per minute; recovery does not spend a new-submission allowance. Remote preflight and manual recovery have a separate, shared attempt budget (five per author/minute, one hundred globally/minute), charged outside transactions even on failure. Unchanged completed submissions return locally. Remote preflight holds no database transaction; final allocation rechecks the frozen revision and the previously observed submission, returning its authoritative state if recovery changed it. Card/admin/account deletion returns a conflict while delivery is pending or leased, including uncertain remote outcomes; recover the operation first. A database trigger also guards cascaded ledger deletion, including an unidentified PR after a lost creation response. Completion clears its lease atomically. Pending and blocked submissions retain their frozen Draft Version and its artwork reference beyond the normal five-version history. User-rejected remote attempts do not charge the global budget.
   GitHub HTTP failures are checked before parsing successful JSON; malformed responses (including missing or incorrectly typed required fields), network failures, timeouts and internal Workshop exceptions are classified separately. Each failure records the submission ID, attempt, phase, fixed operation name, HTTP status and format-validated GitHub request ID in the existing `github_propose_audit`. Raw exception messages, request/response bodies, tokens and card contents are excluded. Durable failure state and its audit entry commit in the same lease-fenced transaction; remote preflight failures also receive a sanitized audit entry. After four automatic attempts the dialog explicitly reports that recovery is paused, counts down the wait and enables manual recovery of the same operation when due. Status polling continues until completion or attention is required; the transport never automatically replays writes.
6. A lost branch response is reconciled against the planned commit and expected head. PR recovery queries all states with pagination and verifies repository, branch, marker and commit. A creation intent is persisted before POST; an unknown result is never blindly POSTed again, even after an empty query. This is recoverable delivery, not an external exactly-once guarantee. `GET .../submit-review` reads authoritative status; `POST` with `action:recover` continues that operation only. Unknown or ambiguous results retain the operation and expose its ID for maintainer investigation.
7. Bind the actual head and submitted version transactionally. A concurrently edited draft is retained and reported as `draft_changed`; it is not approved or silently bound to the old submission. New bindings clear old approvals. Temporary post-bind review-read failure retains the PR and clears freshness so refresh can retry.
8. Signed, deduplicated webhooks and publish-time review reads require a real push-authorized review on the exact head. No OWNER approval is synthesized. Incomplete review connections fail closed. GraphQL reads are not claimed to be transactional snapshots; local binding and lifecycle checks fence reconciliation. Head changes, draft, retarget, close, dismissal and changes-requested invalidate approval. Approved authors may publish before merge; release inclusion completes built-in takeover.

Legacy migration is explicit. Reconstruct the old pinned version's generated source/art; ignore only its provenance header when comparing source. Missing baselines or manual changes require maintainer handling. Preserve independent tests, drafts, versions and old PR links. Run the read-only inventory and resolve synthetic approvals before enabling the App cutover; see [the runbook](operations/github-oauth-app-setup.md).

| Module | Responsibility |
|---|---|
| `server/workshop-pr/propose-handler.ts` | Author/gate checks, fixed-operation allocation and API status |
| `server/workshop-pr/submission-store.ts` | Durable identity, checkpoints, leases, rate limits |
| `server/workshop-pr/submission-service.ts` | Conditional delivery, safe updates and bounded reconciliation |
| `server/workshop-pr/github-app.ts` | One App, repository-scoped write and separate read tokens |
| `server/workshop-pr/github-client.ts` | GitHub transport, expected-head ref updates and preserved test patches |
| `server/workshop-pr/code-gen.ts` | Community Card Source, registries, artwork and index generation |
| `server/workshop-review/` | Exact-head review reads and signed webhook reconciliation |
| `client/services/workshop-pr.ts` | Submit, status and explicit recovery; no OAuth popup |

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
- Keep the top-level helper constants, functions, and types that `CARD_IMPL` reaches, in source order; drop unreachable helpers and top-level expression statements.
- Emit untyped parameters as `any` and give top-level helper functions an `any` return, with a file-level `no-explicit-any` lint exemption, because sandbox code is untyped JavaScript checked at runtime.
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

Workshop draft errors include a machine-readable `code`. Saving a live card returns `409` with `code: 'live_edit_blocked'`; the editor asks the author to unpublish and retains local edits through that action. A `409` opens whole-draft conflict resolution only when the returned server revision differs from the request's `baseRevision`. Same-revision rejections display their actual reason instead.

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
| `pg` | PostgreSQL | Asynchronous queries and connection-scoped transactions |
| `@aws-sdk/client-s3` | Private resources | S3 protocol for local and external services |
| `better-sqlite3` | Legacy import | Read-only migration input only |
| `@types/better-sqlite3` | Types | Development dependency |
| `nanoid` | Short IDs | User, card, and Room IDs |

`crypto.scrypt` and `crypto.randomUUID` are built into Node.js.

---

## G. Implementation phases

### Phase 1: Database and authentication

- Initialize PostgreSQL migrations and asynchronous transactions in `server/db.ts`.
- Create `server/auth.ts` for registration, login, and sessions.
- Add authentication middleware to `server/index.ts`.
- Create `client/app/LoginPage.tsx` and `AuthContext`.
- Import retained legacy data into PostgreSQL and private S3.
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

Last updated 2026-10-06.

### Complete

| Feature | Files |
|---|---|
| Registration, login, logout, session validation, email verification, and OAuth | `server/auth.ts`, `server/auth-cookies.ts`, `server/oauth/`, `client/app/LoginPage.tsx`, `client/contexts/AuthContext.tsx` |
| PostgreSQL and migrations | `server/db.ts` |
| WebSocket authentication | `server/connection/ws-server.ts`, `server/connection/room-router.ts`, `shared/contract/protocol/ws.ts` |
| Durable recorded Room commits to PostgreSQL | `server/game/room-persistence-checkpoint.ts`, `server/game/room-committer.ts`, `server/game/persistence/postgres-adapter.ts` |
| Room recovery after server restart | `server/connection/ws-server.ts`, `server/game/persistence/postgres-adapter.ts` |
| PostgreSQL-only game-state persistence | `server/game/persistence/postgres-adapter.ts` |
| Completed-result archive and full-state removal | `server/game/room-persistence-checkpoint.ts`, `server/game/persistence/postgres-adapter.ts` |
| Room TTL expiry | `server/connection/ws-server.ts`, `server/game/persistence/postgres-adapter.ts` |
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

## Administrator operations dashboard

Administrators enter `?page=operations` from Settings. The overview refreshes every 15 seconds and shows application readiness, distinct online users, live ordinary multiplayer Rooms, five-minute command p95 and system error ratio, component status, collection time and anomaly reasons. Grafana opens through a one-use authenticated handoff and provides current/24-hour/seven-day trends, WS round filtering and size distributions. It is read only and sends no external notifications. It grants no access to hidden active-game state.

Usage counts exclude development and hotseat Rooms from ordinary playing/waiting totals and show those categories separately. Standalone HTTP/browser sandboxes are not Rooms. Online users are authenticated live WS users deduplicated across instances; incomplete or expired per-instance observation coverage is unknown, not zero; HTTP-only sessions are not presence. Anonymous development sockets contribute to connections but not authenticated-user totals. Completed usage comes from authoritative game results, not command attempts. Room presence counts use the current ownership epoch and live lease. Unknown/expired sources and insufficient percentile samples remain empty rather than healthy zeroes. Operational defaults and thresholds are documented in [HOW_TO_DEPLOY](HOW_TO_DEPLOY.md#operations-monitoring); source code defines the implementation.
