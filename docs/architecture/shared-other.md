# Other `shared/` modules and Game Variants

[English](shared-other.md) | [中文](shared-other_zh.md)

## `shared/draft/`

Pure functions for simultaneous selection (`initDraftState`, `processSubmit`, `tryAdvanceRound`, `finalizeDraft`); `createRoom` enables it with `draftMode: 'simultaneous'` and `draftPoolSize: 7..10`. With Farmers of the Moor, occupations, FoM minors and published minors draft in separate stages, the FoM minor pool derives from the implemented registry and refuses to start when short unless `allowIncompleteFarmersOfTheMoorMinorDeal` is set; Community Deck minors join only the published part.

## Game Variants

A Game Variant changes setup, public state, Action Spaces, phase flow or scoring for one game; it is not a card source and adds no frontend rules.

- **Parent Cards** ([ADR 0005](../adr/0005-parent-cards-dedicated-expansion-runtime.md)) are structured data in `shared/parents/*` with assets pinned by `public-assets.ref`, separate from Card Source projections; selection, rewards and side quests are backend-authoritative and use non-public seeds.
- **Through the Seasons** keeps the four season spaces on the board and enables only the current one; its modifiers register in each Core's `ActionHookRegistry` and never write player `cardStates`. The season advances as soon as the new round number commits, before preparation; preparation then applies ordinary round growth before the season's accumulation adjustments (`applyRoundGrowth()`, then `applySeasonPreparationAdjustments()`), which clamp at zero. Seasonal gain and construction hooks carry their source through `actionContext` to the existing result fact ([ADR 0034](../adr/0034-seasonal-adjustments-belong-to-settlement-events.md)); `server/__tests__/seasonal-grants-session.test.ts` covers the pending, recovery and undo boundaries.
- **Farmers of the Moor** ([ADR 0007](../adr/0007-farmers-of-the-moor-variant-runtime.md)) adds terrain, extensions, horses, heating and its major supply through the generic seams in [domain](domain.md). Without simultaneous draft, `createInitialPlayers()` (`shared/session/state-bootstrap.ts`) deals each player 4 FoM minors plus 3 published minors; extra, custom and Community Deck minors join only the published deal, and a short FoM pool lowers every player's FoM portion equally only when `allowIncompleteFarmersOfTheMoorMinorDeal` is set.
- Actual Moor special actions share `buildMoorSpecialActionFlow` in `shared/moor/special-action-flow.ts`: normal and borrowed card actions, card grants, and scheduled offers validate their selected action and target before entering before reactions. Owner-grouped before sources use native activation and trigger-select; the body revalidates before committing. After base commit, a native completion frame freezes after sources and original receipts before required follow-ups. The shared engine completion boundary waits for payment, onBuy and animal handling, then joins terminal rule reactions by owner. Taking a card alone does not enter this lifecycle or emit placement/action-space use. See [ADR 0032](../adr/0032-unified-moor-special-action-lifecycle.md) and `server/__tests__/{moor-granted-lifecycle,moor-completion-window}-session.test.ts`.
- **Snake Opening** reverses only round-1 work rotation ([Rotation, extra turns and supply people](session.md#rotation-extra-turns-and-supply-people)).

## `shared/custom-code/`

Workshop cards are admitted only through the deployed Workshop Capability Contract ([ADR 0025](../adr/0025-workshop-capability-contract-is-fail-closed-and-opened-by-tests.md)).

- `ast-validator.ts` validates custom-card TypeScript with an AST: approved imports only, no forbidden APIs, network or I/O; `effect` must be an object literal; listener phases and effect keys must be in the contract allowlist.
- `sandbox-listener-actions.ts` is the single action list shared by prompts, the validator, server and browser manifests and doc sync (`pnpm run check:prompt-sync`); GitHub references cannot widen it.
- `flow-admission.ts`, `contract-admission.ts` and `listener-result-validator.ts` reject, before the engine, any output outside the contract: unlisted actions, foreign-card nodes and listeners, unopened node fields, wrong-typed opened fields and parameters, undocumented parameters, query results of the wrong type and writes to another card's or player's animal zones. Native card flows are not checked.
- Listener `costs` must come with matching `costAttribution`. Sandbox constraints are documented in [`docs/CUSTOM_CARD_SANDBOX.md`](../CUSTOM_CARD_SANDBOX.md); runtime isolation lives in `server/custom-code/` ([server/custom-code/: Isolated execution](server.md#servercustom-code-isolated-execution)).

Tests: `shared/custom-code/__tests__/`, `server/__tests__/workshop-contract-*-session.test.ts`.

## `shared/i18n/` and `shared/utils/`

`shared/i18n/` holds UI copy keys and resources; `PromptKey` lives in `shared/contract/prompt-keys.ts`. `shared/utils/` holds generic helpers with no business rules; `rng.ts` owns the Explicit Seed generator and the HMAC-SHA256 wide-seed streams.

