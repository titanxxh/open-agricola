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

- `interaction-focus.ts` maps the local Interaction Player's authoritative request to a display target. Occupation selection reveals the private hand after seat confirmation; payment continuations retain the action focus, and completion returns to Action Spaces. The Session interaction adapter publishes an opaque waiting-step `requestKey` to its responder, stable across candidate refreshes and cursor restoration; manual browsing does not trigger another scroll. The shared target anchors and return shortcut support subsequent farm and improvement selection paths.

- `board/ActionSpaceDescription.tsx` renders action-space symbols from the authoritative `baseDescriptionPreview`; costs and quantities stay in that rule tree. Detailed tooltips and interaction choices use `interaction/ActionDescription.tsx`. The board keeps symbolic presentation without maintaining a second rule table; component and browser coverage is in `ActionBoard.test.tsx` and `action-space-icons.spec.ts`.
- `client/app/GameContainerApi.tsx` with `useTransportSetup`, `LobbyPage.tsx` and `PageRouter.tsx` orchestrate views and derive interactivity from `viewPlayerId` and `playerIndex`.
- Game layouts share the player overview and read-only public farms. Narrow screens put the overview first and the expanded Action Log last; detailed scoring opens on demand. `ActionBoard.actionSpaceOutlets` moves existing action-space views into expansion panels without duplicating availability or worker markers. Layout coverage is in `mobile-table-layout.spec.ts`, `mobile-game-layout.spec.ts` and `desktop-table-layout.spec.ts`.
- `common/CardWithCopy.tsx` owns touch inspection and request-bound card-play confirmation. `CardDetails.tsx` uses a modal dialog with independently scrolling content and persistent close/play controls. `useCardPlayChoice` prevents duplicate hand or supply submissions, observes transport settlement, and allows failed requests to retry; current authoritative options and local-seat permissions control submission. Occupation multi-selection keeps its group confirmation. Coverage is in `PlayerCard.touch.test.tsx` and `touch-card-play.spec.ts`.
- `improvement-selection.ts` projects enabled request options against the responder's hand and current major supply. Improvement requests focus the minor hand when it has candidates, the expanded major supply when only majors are legal, and controls when neither has candidates. `PlayerFarmPanel.improvementSupply` places the single major-supply view beside the hand; explicit expansion belongs to the request key and survives repeated snapshots. Coverage is in `GameContainerApi.presentation.test.tsx`, `MajorImprovements.test.tsx`, and `improvement-focus.spec.ts`.
- The default playtest path is backend `POST /api/game/new-sandbox`. With `VITE_SANDBOX_EXECUTOR=browser`, Workshop playtesting runs in the browser: `LocalGameTransport` implements `GameTransport`, the Worker assembles shared `GameCore` with locally validated custom code, and `server/__tests__/local-sandbox-parity.test.ts` locks behavior to the server executor. A ten-second timeout rebuilds the Worker from the last persisted snapshot, including `engineStackCursor`, and tells the UI it rolled back. One IndexedDB slot persists the game; a mismatched schema is deleted. A playtest pinned to an `exactVersionId` still uses the backend sandbox.
- `AuthContext` is the site login session (password, GitHub or Google) and stores no Issue-write authorization; `LocaleContext` switches locale.

### Agreed interaction design, pending implementation

The following requirements were agreed during UI design. They describe the target behavior, not completed implementation.

- Interaction Focus follows the authoritative request for the local Interaction Player and respects the existing hotseat privacy boundary. Occupation selection focuses the occupation hand. Minor improvement selection focuses the minor hand.
- Room construction, fencing, stable construction, plowing, sowing, position selection, and animal reorganization focus the farm operation area. The target follows the requested input rather than the action-space name. When an operation also permits Card Field or card-owned animal slots, their controls appear beside the farm and share the same authoritative targets and local draft. The cards themselves retain their chronological positions.
- The major improvement supply opens beside the improvement hand and remains a single view of the authoritative supply. Mixed improvement selection starts at the minor hand with an explicit major-supply control. A request with only legal major improvements focuses the open supply directly. A minor-only request exposes no major-purchase control.
- On touch devices, a card tap opens its details. An explicit play control submits the choice. Closing details preserves the player's place in the hand.
- Focus follows payment and other subsequent requests. It returns to the action area only after the entire action completes. Automatic focus runs once when a new request needs local input. Repeated snapshots do not interrupt manual browsing, and other players' actions do not move this player's viewport. A target already fully visible on desktop receives a highlight without extra scrolling.
- Played occupations and improvements share one display ordered from earliest to latest by Played Card Chronology. New entries append at the end, from left to right and then top to bottom. Departed cards disappear. Replayed cards and cards newly acquired through upgrades or exchanges append at their new entry time. Ability triggers and card-state updates retain their positions. Undo restores the prior order, and reconnect preserves the current order. Parent Cards retain their separate area.
- Chronology uses complete effective authoritative history at the snapshot projection boundary, before History Window trimming. The client does not infer order from grouped card arrays or snapshot arrival times.
- Narrow screens retain the continuous page. Fixed controls must not cover operation targets or required controls. Fencing provides larger touch hit areas, visible edge selection, and a selected-edge count with its authoritative cost. Card details fit short viewports, and the operation bar prioritizes the current task with a shortcut back to its target.

Verification covers mixed card chronology, departure and re-entry, upgrades, exchanges, undo, and reconnect after events leave the History Window. Interaction coverage includes consecutive card plays, payment continuations, farm and card-owned targets, and repeated snapshots. Mobile acceptance checks actual target visibility above fixed controls, fence touch targets, and detail dismissal with preserved scroll position on narrow portrait and short landscape screens. Touch behavior requires a real-device check.

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

