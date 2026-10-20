# `client/`: Frontend

[English](client.md) | [中文](client_zh.md)

The client renders authoritative snapshots, collects input and keeps temporary local UI state. It never adjudicates rules.

## Client bundles

| Bundle | Entry | Paths | Constraint |
|---|---|---|---|
| `client-app` | `client/main.tsx` | `client/{app,components,services,hooks,contexts,utils}/` | Uses WebSocket. From `shared/*`, imports only `contract`, `domain` and `i18n`; card display uses manifest-backed `card-meta` plus `custom-card-metadata`. |
| `client-sandbox` | `client/sandbox/index.tsx` | `client/sandbox/` | Lazy Workshop sandbox UI; rules execute through the backend sandbox path. |
| `local-sandbox-worker` | `client/local-sandbox/worker.ts` | `client/local-sandbox/` | Browser-mode engine Worker for Workshop playtesting; only its Worker-side files may import complete `shared/*`, and main-bundle `local-transport`, `persistence` and `workshop-launch` use type-only shared imports. |
| `replay-viewer` | `replay-viewer/src/main.tsx` | `replay-viewer/` | No login, cookies, WebSocket or commands; reads only public Replay JSON with display filtering compiled at archive time. |

- Exact entry and file permissions live in `scripts/architecture-policy.mjs`; no directory has a blanket exemption. ESLint `architecture/imports` and `pnpm run check:browser-boundaries` enforce them as CI errors.
- `scripts/check-bundle-size.ts` budgets the main bundle at 550 KB raw and 170 KB gzip, as a separate post-build check.

## Services and synchronized state

- `gameTransport.ts` (`WsGameTransport`) owns the WebSocket in the service layer. It journals unconfirmed commands per tab, isolates old socket callbacks, suspends input while reconnecting, queries receipts, waits for a complete filtered snapshot, and retries only still-valid inputs with their original identity.
- `card-meta.ts` fetches `GET /cards-manifest.json`; `rehydrate.ts` rehydrates snapshots without importing `shared/actions` or the card catalog.
- `client/hooks/useGameSync.ts` replaces `state`, `pending`, `interaction` and `scores` as a unit on every `stateUpdate`. There are no optimistic commits: a click sends a command, and game UI changes only after the snapshot arrives. Local ephemeral state (hover, drafts, inputs) is separate and invalid selections clear on a new snapshot.
- Reconnect runs `joinRoom` → `roomJoined(status, …)`: `waiting` restores the waiting page and only `playing` continues to `getState`; a `roomWaiting` broadcast after `newGame` hides the old board.
- The client consumes public events by `occurrenceId` for transient notifications, highlights and animations; an initial snapshot initializes the cursor without replaying history. The Action Log reads `publicEventArchive` as a read-only timeline.
- Player names localize through `client/utils/player-name.ts` from generated-name provenance and seat index; supplied names render literally.
- `llm/generation/`: the browser owns generation attempts, the provider tool protocol and bounded GitHub reads pinned to one main SHA. The LLM credential goes only to the configured provider. `server/workshop-references.ts` serves authenticated tree metadata with project credentials and accepts no caller URL or model credential; the browser fetches pinned raw text anonymously and verifies blob hashes. `GET /api/workshop/sandbox-contract` supplies the deployed contract the prompt is built from; references cannot widen it. `POST /api/workshop/cards/validate-code` binds validation to source and sandbox identities, and only separately verified provider / endpoint / model tuples are admitted. See [Platform design](../PLATFORM_DESIGN.md) and [`docs/test/llm-card-gen.md`](../test/llm-card-gen.md).

## Views and local sandbox

- `board/ActionSpaceDescription.tsx` renders action-space symbols from the authoritative `baseDescriptionPreview`; costs and quantities stay in that rule tree. Detailed tooltips and interaction choices use `interaction/ActionDescription.tsx`. The board keeps symbolic presentation without maintaining a second rule table; component and browser coverage is in `ActionBoard.test.tsx` and `action-space-icons.spec.ts`.
- `client/app/GameContainerApi.tsx` with `useTransportSetup`, `LobbyPage.tsx` and `PageRouter.tsx` orchestrate views and derive interactivity from `viewPlayerId` and `playerIndex`.
- The default playtest path is backend `POST /api/game/new-sandbox`. With `VITE_SANDBOX_EXECUTOR=browser`, Workshop playtesting runs in the browser: `LocalGameTransport` implements `GameTransport`, the Worker assembles shared `GameCore` with locally validated custom code, and `server/__tests__/local-sandbox-parity.test.ts` locks behavior to the server executor. A ten-second timeout rebuilds the Worker from the last persisted snapshot, including `engineStackCursor`, and tells the UI it rolled back. One IndexedDB slot persists the game; a mismatched schema is deleted. A playtest pinned to an `exactVersionId` still uses the backend sandbox.
- `AuthContext` is the site login session (password, GitHub or Google) and stores no Issue-write authorization; `LocaleContext` switches locale.

## Game Context, Replay Viewer and Bug Report

```text
GameContextRouter
  ├─ active -> AuthProvider -> existing PageRouter / GameContainerApi plus optional read-only Anchor drawer
  ├─ completed -> ReplayShell -> credentialless Replay Viewer iframe
  ├─ expired with retained Anchor -> credentialless historical Viewer for one-frame evidence
  ├─ expired -> Expired Game Context page
  └─ removed -> Replay Tombstone page
```

- `?context=<roomId>` is parsed before the card manifest and login gate; an unauthenticated active context keeps the complete `returnTo`, and non-active contexts load no authentication dependency.
- Active recovery joins with `intent:'resume'`; the server restores only the original seat. During a save pause every online seat sees the same status and new-command controls are disabled.
- `ReplayShell` validates the Replay header and content-addressed Viewer manifest and creates a `credentialless`, `sandbox="allow-scripts"` iframe only after a perspective is chosen. The historical Viewer never calls authenticated APIs; retained evidence is passed by `postMessage`.
- A corrupt Segment marks an unavailable interval and resumes at the next checkpoint; it is never silently repaired.
- Bug Report saves a server draft before GitHub OAuth, resumes the same `submissionId` after cancellation and polls status after submission; a lost submission response rereads the authoritative status, so a report is never created twice. An active Reporter anchors the latest committed Step; a completed-game Reporter must be an original participant and anchors the displayed Step.
- The Issue Submission Connection is separate from `AuthContext`: the report footer owns the initial connection, Settings shows status and disconnect only, and an invalid connection never switches to Hosted Issue Identity.

