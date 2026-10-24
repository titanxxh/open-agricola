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
- Waiting-room messages provide authoritative seat colors and connection status. `WaitingRoomPlayers` renders every seat, including vacancies, and keeps disconnected participants visible because their seats remain reserved. Its color picker offers all six colors, disables colors held by other participants, and waits for the server to publish the saved selection.
- Player names localize through `client/utils/player-name.ts` from generated-name provenance and seat index; supplied names render literally.
- `llm/generation/`: the browser owns generation attempts, the provider tool protocol and bounded GitHub reads pinned to one main SHA. The LLM credential goes only to the configured provider. `server/workshop-references.ts` serves authenticated tree metadata with project credentials and accepts no caller URL or model credential; the browser fetches pinned raw text anonymously and verifies blob hashes. `GET /api/workshop/sandbox-contract` supplies the deployed contract the prompt is built from; references cannot widen it. `POST /api/workshop/cards/validate-code` binds validation to source and sandbox identities, and only separately verified provider / endpoint / model tuples are admitted. See [Platform design](../PLATFORM_DESIGN.md) and [`docs/test/llm-card-gen.md`](../test/llm-card-gen.md).

## Views and local sandbox

- `interaction-focus.ts` maps the local Interaction Player's authoritative request to a display target. Occupation selection reveals the private hand after seat confirmation; payment continuations retain the action focus, and completion returns to Action Spaces. The Session interaction adapter publishes an opaque waiting-step `requestKey` to its responder, stable across candidate refreshes and cursor restoration; manual browsing does not trigger another scroll. The shared target anchors and return shortcut cover hand, supply, and farm selection paths.
- Farm selection, spatial choices, animal reorganization and locally selected Moor terrain use the farm target. The grid sizes against the effective viewport and fixed operation bar, including farm extensions. Fence controls enlarge the hit region with tapered ends so neighboring edges remain distinct. Drafts survive repeated requests and lose only withdrawn targets. `fence-selection-quote.ts` displays authoritative selection costs and discards replies after the snapshot, request or draft changes; a quote never enables submission. Coverage is in `farm-interaction-focus.spec.ts` and the focus, farm-draft and quote component tests.

- `board/ActionSpaceDescription.tsx` renders action-space symbols from the authoritative `baseDescriptionPreview`; costs and quantities stay in that rule tree. Detailed tooltips and interaction choices use `interaction/ActionDescription.tsx`. The board keeps symbolic presentation without maintaining a second rule table; component and browser coverage is in `ActionBoard.test.tsx` and `action-space-icons.spec.ts`.
- `client/app/GameContainerApi.tsx` with `useTransportSetup`, `LobbyPage.tsx` and `PageRouter.tsx` orchestrate views and derive interactivity from `viewPlayerId` and `playerIndex`.
- Game layouts share the player overview and read-only public farms. Narrow screens put the overview first and the expanded Action Log last; detailed scoring opens on demand. `ActionBoard.actionSpaceOutlets` moves existing action-space views into expansion panels without duplicating availability or worker markers. Layout coverage is in `mobile-table-layout.spec.ts`, `mobile-game-layout.spec.ts` and `desktop-table-layout.spec.ts`.
- `common/CardWithCopy.tsx` owns touch inspection and request-bound card-play confirmation. `CardDetails.tsx` uses a modal dialog with independently scrolling content and persistent close/play controls. `useCardPlayChoice` prevents duplicate hand or supply submissions, observes transport settlement, and allows failed requests to retry; current authoritative options and local-seat permissions control submission. Occupation multi-selection keeps its group confirmation. Coverage is in `PlayerCard.touch.test.tsx` and `touch-card-play.spec.ts`.
- `improvement-selection.ts` projects enabled request options against the responder's hand and current major supply. Improvement requests focus the minor hand when it has candidates, the expanded major supply when only majors are legal, and controls when neither has candidates. `PlayerFarmPanel.improvementSupply` places the single major-supply view beside the hand; explicit expansion belongs to the request key and survives repeated snapshots. Coverage is in `GameContainerApi.presentation.test.tsx`, `MajorImprovements.test.tsx`, and `improvement-focus.spec.ts`.
- The default playtest path is backend `POST /api/game/new-sandbox`. With `VITE_SANDBOX_EXECUTOR=browser`, Workshop playtesting runs in the browser: `LocalGameTransport` implements `GameTransport`, the Worker assembles shared `GameCore` with locally validated custom code, and `server/__tests__/local-sandbox-parity.test.ts` locks behavior to the server executor. A ten-second timeout rebuilds the Worker from the last persisted snapshot, including `engineStackCursor`, and tells the UI it rolled back. One IndexedDB slot persists the game; a mismatched schema is deleted. A playtest pinned to an `exactVersionId` still uses the backend sandbox.
- `AuthContext` is the site login session (password, GitHub or Google) and stores no Issue-write authorization; `LocaleContext` switches locale.

### Interaction display invariants

- New local input requests trigger focus once. Repeated snapshots and other players' actions preserve manual browsing. A fully visible target receives a highlight without scrolling. Payment and other continuations retain focus until the whole action completes.
- Narrow screens retain a continuous page. The operation bar prioritizes the current task and required confirmation, with a shortcut to its target. Targets and confirmation controls remain above fixed controls, including in short landscape viewports.
- Played occupations and improvements share the snapshot's `playedCardChronology` order, from left to right and then top to bottom. Entry and re-entry append cards, while state updates preserve position. Parent Cards remain separate. The snapshot projection uses complete effective history before History Window trimming; see [the protocol contract](contract.md). Coverage is in `played-card-chronology-session.test.ts` and `played-card-chronology.spec.ts`.
- Browser acceptance covers narrow portrait, short landscape, hotseat privacy, undo, reconnect, and stale card details. Chromium touch emulation and WebKit checks do not replace physical-device touch acceptance.

## Game Context, Replay Viewer and Bug Report

```text
GameContextRouter
  ├─ active -> AuthProvider -> existing PageRouter / GameContainerApi plus optional read-only Anchor drawer
  ├─ completed -> ReplayShell -> credentialless Replay Viewer iframe
  ├─ expired with retained Anchor -> credentialless historical Viewer for one-frame evidence
  ├─ expired -> Expired Game Context page
  └─ removed -> Replay Tombstone page
```

- `game-room-url.ts` generates ordinary game links with only `room`; connection and seat selection come from the Room and authenticated account. Development links retain explicit seat controls.
- `?room=<roomId>` is parsed before the card manifest and login gate; an unauthenticated active context keeps the complete `returnTo`, and non-active contexts load no authentication dependency.
- Room links join over WebSocket without a client-selected seat; the server restores an account's existing seat or admits a new player to an available waiting seat. During a save pause every online seat sees the same status and new-command controls are disabled.
- `ReplayShell` validates the Replay header and content-addressed Viewer manifest and creates a `credentialless`, `sandbox="allow-scripts"` iframe only after a perspective is chosen. The historical Viewer never calls authenticated APIs; retained evidence is passed by `postMessage`.
- A corrupt Segment marks an unavailable interval and resumes at the next checkpoint; it is never silently repaired.
- Bug Report saves a server draft before GitHub OAuth, resumes the same `submissionId` after cancellation and polls status after submission; a lost submission response rereads the authoritative status, so a report is never created twice. An active Reporter anchors the latest committed Step; a completed-game Reporter must be an original participant and anchors the displayed Step.
- The Issue Submission Connection is separate from `AuthContext`: the report footer owns the initial connection, Settings shows status and disconnect only, and an invalid connection never switches to Hosted Issue Identity.

