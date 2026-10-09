# Custom Card Sandbox Reference

[English](CUSTOM_CARD_SANDBOX.md) | [中文](CUSTOM_CARD_SANDBOX_zh.md)

This document is the **single source of truth** for what custom-card TypeScript submitted through Workshop or AI Designer can and cannot use inside the isolated-vm sandbox.

Read this document if you maintain:

- AI system prompts: `client/services/llm/generation/prompt.ts` includes the deployed contract returned by `server/workshop-sandbox-contract.ts`. Hook, phase, scope, action-ID, helper and semantic facts come from the running backend and shared source metadata; reference examples are read from GitHub on demand.
- Workshop UI copy in `client/app/workshop/AiCardDesigner.tsx` or `WorkshopPage.tsx`.
- Sandbox references in [`docs/ARCHITECTURE.md`](ARCHITECTURE.md).
- LLM automation in `docs/test/llm-card-gen.md`, whose fixtures exercise this contract against a real model.

When this document changes:

1. Treat it as the human-readable mirror of hooks, phases, scopes, and action IDs. Source constants own the name allowlists: `cardEffectHooks`, `sandboxListenerPhases`, `sandboxListenerScopes`, and `SANDBOX_ALLOWED_ACTION_IDS`. Exhaustive maps own descriptions. The deployed sandbox contract renders them at runtime and the browser includes it in the generation prompt; there is no hand-copied prompt table. CI command `pnpm run check:prompt-sync` checks only that the names in each `prompt-sync` block match source.
2. Make `docs/ARCHITECTURE.md` point here instead of maintaining another copy.
3. Name synchronization does not cover payment semantics, hook parameters and return values, or helper data shapes. Update executor and prompt-contract tests and run the fixed browser acceptance batch described by `docs/test/llm-card-gen.md`; historical golden replay remains a separate regression check.

Official card authors working in `shared/cards/<deck>/<id>.ts` are not subject to this sandbox. They may import project helpers directly. This contract applies only to Workshop custom cards.

---

## 1. Injected globals

`server/custom-code/engine.ts` injects these globals into the isolate:

<!-- prompt-sync:begin id=sandbox-injections -->

| Global | Shape | Notes |
|---|---|---|
| `MinorImprovement(def)` | Function stub | Returns `def` directly; `new MinorImprovement(def)` also works |
| `Occupation(def)` | Function stub | Same behavior |
| `console.log(...)` / `console.warn(...)` | Functions | Forward to host `console`; nonstring arguments pass through `JSON.stringify` |
| `gainLeaf(cardId, resources)` | Function | Returns `{ type: 'leaf', actionId: 'gain', params: resources, sourceCard: cardId }` |
| `payLeaf({ cardId, cost })` | Function | Returns `{ type: 'leaf', actionId: 'pay', params: cost, sourceCard: cardId }` |
| `spaceHasPlayer(space, playerId)` | Function | Tests whether a specific player occupies an action space |
| `positionKey(pos)` | Function | Converts `{ row, col }` to deterministic string `"row-col"` |
| `getCardDefinition(cardId)` | Function stub | Always returns `null`; the sandbox cannot access the card registry |
| `getCardStack(player, cardId)` | Function | Returns a shallow copy of `player.cardStates[cardId].stack` |
| `readCardExtraData(player, cardId)` | Function | Returns a shallow copy of `player.cardStates[cardId].extraData` |

<!-- prompt-sync:end id=sandbox-injections -->

`registerCardEffect` and `registerCardListener` are no longer injected. The current contract exports `CARD_DEF` and `CARD_IMPL` constants, described in section 7.

No project helper is injected. Calling any of the following throws `ReferenceError`:

`familySize`, `workersAvailable`, `workersAtHome`, `getFenceCount`, `getPalisadeCount`, `countFields`, `countOccupations`, `countPeopleOnSpace`, `fieldHasCrop`, `fieldHasGrain`, `fieldHasVegetable`, `cardCountsAs`, `isEffectivelyMajor`, `holdWorkerOnCard`, `releaseWorkerFromCard`, `initCardState`, `incCounter`, `setCounter`, `setFlag`, and every other export under `shared/domain/player.ts`, `shared/cards/__stubs__/helpers.ts`, or `shared/cards/helpers/`.

Use an injected helper above or read `state` and `player` fields directly as described in section 4.

### 1.1 Extra normalization from Workshop to repository pull request

Sandbox source is designed to save, preview, and run in Workshop. After submission, it becomes a real TypeScript module under `shared/cards/community/*.ts` and enters complete CI. `server/workshop-pr/code-gen.ts` therefore applies conservative normalization:

| Workshop source | Generated pull-request source | Reason |
|---|---|---|
| `deck: 'CUSTOM'` | `deck: 'community'` | Community-deck validation requires the `community` deck |
| `const CARD_IMPL = { ... }` | `const CARD_IMPL: CardImpl = { ... }` | Contextually types listener action and phase literals instead of widening them to `string[]` |
| Listener without `id` | Adds `{cardId}-listener-{n}` | Registration and ordering require a stable ID |
| `prerequisite: { occupation: 2 }` | `prerequisite: '2 Occupations'` plus `occupationPrerequisites: { min: 2 }` | Repository `prerequisite` is printed copy; structured validation uses `occupationPrerequisites` |
| Top-level helper constants, functions, and types | Kept in source order when `CARD_IMPL` reaches them directly or through another helper; unreachable helpers and top-level expression statements are dropped | `CARD_IMPL` calls them at runtime, and `noUnusedLocals` rejects leftovers |
| Untyped parameters | Emitted as `any`; top-level helper functions also return `any`, and the file gets a `no-explicit-any` lint exemption | Sandbox code is untyped JavaScript checked at runtime; the strict build rejects implicit `any` and a returned `{ type: 'seq' }` widened to `string` |

The generator also produces:

- `shared/cards/community/{CUSTOM_ID}.ts`, the Card Source with UI metadata and `CardImpl`;
- `shared/cards/register-all.ts`;
- `shared/cards/catalog.generated.ts`;
- `docs/community_cards.md`;
- optional `public/card-art/community/{CUSTOM_ID}.{ext}`.

A submitted pull request must at least pass:

```bash
pnpm run check:community-deck
pnpm exec tsc -p tsconfig.server.json --noEmit
pnpm run build
```

If a card runs in the sandbox but generated pull-request source fails TypeScript, fix generator normalization first instead of editing only that generated card. Otherwise the next submission repeats the failure.

#### 1.1.1 Generated single Card Source

For a pull request, server `code-gen.ts` normalizes sandbox `CARD_DEF + CARD_IMPL` into:

- `shared/cards/community/{CARD_ID}.ts`, with `defineMinorCard` or `defineOccupationCard`, statically extractable `meta`, runtime `impl`, and `export const {CARD_ID}_impl = {CARD_ID}.impl`.

It also patches:

- `shared/cards/register-all.ts` to register `{CARD_ID}.impl`;
- `shared/cards/catalog.generated.ts` to add the definition;
- `docs/community_cards.md` to add an index row.

The generator creates no generic smoke test. Add a direct behavior test for a simple immediate effect. Payment, choice or pending, delay, cross-player behavior, and multistep flows require a dedicated `GameSession` scenario written by the author, reviewer, or LLM.

Sandbox users continue to write `CARD_DEF` and `CARD_IMPL`, plus any top-level helpers `CARD_IMPL` calls; backend `code-gen.ts` owns the formal module shape.

---

## 2. `state`, `player`, `paymentInfo`, and `context` are deep JSON snapshots

Every isolate input passes through:

```js
const jsonSafe = JSON.parse(JSON.stringify(value ?? null))
```

Consequences:

- There are no methods. Calling `player.xxx()` throws `TypeError`.
- Mutation has no effect on host state. A flow hook returns ActionFlow directly; a listener returns `{ flow }`. The engine performs all settlement.
- `undefined` fields disappear because `JSON.stringify` drops their keys. Use optional chaining and nullish fallbacks when reading.
- Circular references fail during host `JSON.stringify`. `GameState` is acyclic; custom effects must not embed `state` back into effect objects.

Player fields in `CardListenerContext` mean:

| Field | Meaning | `player` scope | `opponent` scope | `any` scope |
|---|---|---|---|---|
| `context.player` | Trigger player who executes the action | Card owner | Not the card owner | May differ |
| `context.ownerPlayer` | Card owner | Same as `player` | The owner | Card owner |
| `context.triggerPlayer` | Alias of `context.player` for readability | N/A | N/A | N/A |
| `context.effectPlayer` | Player who receives the effect, normally the owner | N/A | N/A | N/A |

Use `context.ownerPlayer`, never `context.player`, to test the card owner.

Bind each card listener with `cardIds: [CARD_ID]` so its scope and owner refer to this card. Read player identities through these objects: `context.player.id` and `context.ownerPlayer.id`. There is no `context.playerId`; comparing it with an owner ID can silently suppress every trigger. For a listener bound with `cardIds: [CARD_ID]`, `scope: 'player'` already restricts dispatch to the card owner, so it needs no extra actor/owner guard. Do not infer flat identity fields from native engine internals. The deployed Workshop contract exposes the supported object keys in `listeners.players`.

### 2.1 Readable fields on `context.space`

Runtime `context.space` is `ActionDefinition + resources + takenBy`, as defined in `shared/contract/types.ts`. A listener should read only:

| Field | Type | Use |
|---|---|---|
| `space.id` | `string` | Exact action-space ID such as `renovate-house` or `plow-1` |
| `space.takenBy` | `WorkerRef[]` | Occupancy; test with `spaceHasPlayer(space, playerId)` |
| `space.resources` | `Resource` | Accumulated resources such as wood |

Common hallucinated fields that do not exist are `space.params`, `space.target`, `space.amount`, and `space.houseType`. `params` belongs to an ActionFlow leaf, `{ type: 'leaf', actionId, params }`, not `ActionSpace`. `space.params.X` can transpile in the sandbox because `ts.transpileModule` does not type-check, but repository `pnpm run build` fails with `TS2339: Property 'params' does not exist on type 'ActionSpace'`.

### 2.2 Common tests and traps

- **Renovation target:** the upgrade chain is a fixed wood-to-clay-to-stone sequence. During `renovate-house`, infer the target from `context.player.houseType`; current `wood` means clay and current `clay` means stone. A stone-house renovation discount checks `if (context.player.houseType !== 'clay') return`. See `shared/cards/A/A110_Roughcaster.ts`.
- **Constructed room type:** listen to `construct` and read `context.player.houseType` (`wood`, `clay`, or `stone`). `context.actionId` stays `construct`; `context.choice` is an interaction choice, not a room material.
- **Unused handler parameters:** `tsconfig.json` enables `noUnusedParameters`. Omit an unused parameter or prefix it with `_`; otherwise pull-request CI fails with `TS6133`.

---

## 3. Recognized hook, phase, and scope allowlists

The marked blocks below are machine checked against `cardEffectHooks` in `shared/projections/card-effect-hooks.ts`, `sandboxListenerPhases` in `shared/custom-code/sandbox-listener-phases.ts`, and `sandboxListenerScopes` in `shared/custom-code/sandbox-listener-scopes.ts`. Do not alter marker formatting; `pnpm run check:prompt-sync` will fail.

### 3.1 Hooks available under `CARD_IMPL.effect`

`extractManifestFromCompiledCode` validates function keys against `cardEffectHooks`. Only admitted keys are registered. The AST validator hard-fails an unlisted key when saving.

<!-- prompt-sync:begin id=card-effect-hooks -->
- `onBuy`
- `onBeforeWork`
- `onRoundStart`
- `onHarvest`
- `onRoundEnd`
- `onEndTurn`
- `onReturnHome`
- `onBeforeReturnHome`
- `onStartReturnHome`
- `onAfterRoundEnd`
- `onBeforeHarvest`
- `onStartHarvest`
- `onStartHarvestFieldPhase`
- `onHarvestFieldPhase`
- `onEndHarvestFieldPhase`
- `onAfterReap`
- `onStartHarvestFeedingPhase`
- `onHarvestFeedingPhase`
- `onEndHarvestFeedingPhase`
- `onEndHarvest`
- `onAfterHarvest`
- `onBeforeEndGame`
- `onBeforeStartOfTurn`
- `onBeforePlayerTurn`
- `onAllWorkersPlaced`
- `resolveChoice`
- `contributeExtraTurn`
- `computeBonusScore`
- `computeSharedPostScore`
- `computeCostedBonus`
- `computeExtraRoomCapacity`
- `computeHarvestBreedOrderPriority`
- `onComputeAnimalZones`
- `computeLockedFarmTiles`
- `getInvalidAnimals`
- `getBuiltSpecialStables`
- `getRuleContributions`
- `getStatePresentation`
- `computeResourceCommitments`
- `countExtraTurns`
- `enforceReorganizeOnLastHarvest`
- `computeBreedThreshold`
- `computeBreedableAnimalCount`
- `computeAnimalScoreAdjustment`
- `onComputeSharedAnimalZones`
<!-- prompt-sync:end id=card-effect-hooks -->

`onBeforeWork` runs after round growth and future-meeple actions but before `onRoundStart`. Use it only when the card explicitly acts before the work phase.

`onBeforePlayerTurn` is the non-flow skip-control exception. Its signature is `(state, player) => { skipTurn?: boolean } | void`, and it synchronously skips this labor-turn placement opportunity. It cannot return ActionFlow or create pending state.

Reaction-compatible hooks, namely action-listener `before`, `during`, `immediatelyAfter`, and `after`; the three Harvest-field hooks; `onBeforeEndGame`; and `contributeExtraTurn`, cannot depend on scan order. Multiple simultaneous items enter trigger-select, and the player selects a source card before execution. A custom card should return a replayable ActionFlow for mutation and never treat a handler invocation as final settlement.

`contributeExtraTurn` returns this card's extra-turn provider flow. When several cards contribute, the system asks for the provider source before expanding that flow. `countExtraTurns(state, player)` reports remaining opportunities; pair it with `contributeExtraTurn`. `extraTurnBeforeWorkers` also offers the provider before ordinary workers.

Allowed metadata keys outside `cardEffectHooks` are `id`, `handHooks`, `beforeEndGameScope`, `beforeEndGameMandatory`, `preHarvestGoodsWanted`, `preHarvestGoodsWantedBeforeReap`, `maySkipHarvestFieldPhase`, and `extraTurnBeforeWorkers`.

Advanced-hook details:

| Hook | Special signature | Purpose |
|---|---|---|
| `computeBonusScore` | `(state, player, ctx) => number`, with read-only `ctx.categories` | Free final bonus collected into `cardStateBonusVp` |
| `computeCostedBonus` | `(state, player, ctx) => BonusScoreLevel[]` | Spend resources for VP; declare levels for solver optimization |
| `computeSharedPostScore` | `(state, owner, summaries) => Array<{ playerId, score }>` | Cross-player score such as awarding the owner from the lowest opponent score |
| `contributeExtraTurn` | `(state, player) => ActionFlow | void` | Provider after ordinary workers are exhausted; player selects among multiple providers |
| `resolveChoice` | `(state, player, choice, ctx) => ActionFlow` | Handle player choice; `ctx` provides sourceCard/actionContext data, without host callbacks |
| `computeExtraRoomCapacity` | `(player) => number` | Extra housing capacity |
| `computeHarvestBreedOrderPriority` | `(state, player) => number | void` | Harvest breeding order, with larger values later |
| `onComputeAnimalZones` | `(player, zones, state) => AnimalZone[]` | Return only new zones; do not append input zones, and mutation of the JSON snapshot is ineffective |
| `computeLockedFarmTiles` | `(player) => FarmTilePosition[]` | Locked farm tiles |
| `getInvalidAnimals` | `(player, zone, meeples, state) => Meeple[]` | Card-zone animal restriction; fourth argument supplies the state snapshot |
| `getBuiltSpecialStables` | `(player) => FarmTilePosition[]` | Currently standing special stables for derived snapshot display |
| `getRuleContributions` | `(player) => CardRuleContributions` | Read-only source-owned component reservations and unused-space quantity adjustments; finite, floored, nonnegative and capped by the consuming category |
| `getStatePresentation` | `(player) => CardStatePresentation` | Explicit public counters, resource groups, crop layers and markers; ordinary clients do not read internal storage |
| `handHooks` metadata | `HandCardEffectHook[]` | Stage hooks that also run while the card remains in hand |

Extra sowing and special stables each require a paired candidate and settlement contract: `onComputeSowableFields` with `onSowExtraField`, and `getSpecialStablePositions` with `applySpecialStable`. Settlement relies on in-place host mutation that cannot return through sandbox JSON snapshots, so Workshop exposes neither pair. `handHooks` does not support `onBuy`, `onEndTurn`, `onBeforeEndGame`, or `onBeforePlayerTurn`. `CARD_IMPL.effect` must be a direct object literal with no variable reference, spread, computed key, or accessor, preventing static-validation bypass. Server and browser manifests also reject unsupported hand hooks on the host side. `contributeExtraTurn` is not a hand hook.

Fence discounts such as E16 Briar Hedge and C16 Field Fences use a `computeCosts` listener on `actions: ['fence']`. C1 Overhaul rebuilds only own ordinary fences through `consume-fence` `ownOnly` and generic `fencePolicy`.


### 3.1.1 Complete arguments and additional pure queries

Executors preserve every positional argument, including the fourth and fifth. Ordinary stage hooks receive optional `FlowEffectContext` as their third argument (data field `triggerActionId`); `onBuy(state, player, paymentInfo, ctx)` receives payment and that context. `resolveChoice` receives sourceCard/actionContext in its fourth argument. All arguments are JSON snapshots, without host callbacks.

Additional queries: `computeResourceCommitments(state, owner)` declares player/resource reservations; `countExtraTurns(state, player)` reports remaining opportunities; `enforceReorganizeOnLastHarvest(state, player)` requests final reorganization; `computeBreedThreshold(state, player, animal, ctx)` and `computeBreedableAnimalCount(state, player, animal, count, ctx)` affect breeding; `computeAnimalScoreAdjustment(state, player, animal, ctx)` currently affects only FOTM horse scoring; `onComputeSharedAnimalZones(owner, animalOwner, zones, state)` returns new card zones with distinct owner/animal-owner identities.

`beforeEndGameScope` / `beforeEndGameMandatory` govern targets and obligation. The two `preHarvestGoodsWanted*` declarations distinguish current inventory from guaranteed reaping; `maySkipHarvestFieldPhase` changes that estimate. Metadata-only effects are registered too.

### 3.2 `CARD_IMPL.listeners` allowlists

`actions` accepts only these high-level action IDs. The AST validator rejects an unknown ID:

<!-- prompt-sync:begin id=listener-actions -->
- `anytime`
- `compute-exchanges`
- `collect`
- `gain`
- `receive`
- `plow`
- `sow`
- `construct`
- `renovate-house`
- `fence`
- `stables`
- `improvement`
- `occupation`
- `place-farmer`
- `wish-children`
- `family-growth`
- `bake-bread`
- `breed`
- `reap`
- `pay`
- `bonus-vp`
- `store-on-card`
- `take-from-card`
- `push-to-card-stack`
- `special-effect`
- `future-meeples`
- `exchange`
- `set-first-player`
- `selection`
- `emit-choice`
- `reorganize`
<!-- prompt-sync:end id=listener-actions -->

`sandboxListenerPhases` is the Workshop listener-phase allowlist. Unsupported values are rejected before registration, and the AST validator hard-fails them on save:

<!-- prompt-sync:begin id=action-hook-phases -->
- `before`
- `during`
- `immediatelyAfter`
- `after`
- `computeCosts`
- `computeArgs`
- `computeChoiceCandidates`
- `computeReplace`
- `isDoable`
- `anytime`
- `computeExchanges`
<!-- prompt-sync:end id=action-hook-phases -->


Listener `zones` (default played), `mandatory`, `preScoring`, `replacesTurn`, and `blockedAnytimeInteractionKinds` survive extraction and registration. Omitted cardIds/actions/phases bind this card and these explicit sets, never a global or future wildcard. `anytime` and `compute-exchanges` are dispatcher query identities, usable only in listener filters, not leaf dispatch. `computeExchanges` returns admitted `extraExchanges`. Unsupported listener fields are explicit errors.

### 3.3 Payment-mechanism boundary

Dynamic contributions to an existing action payment use the value returned by a `computeCosts` listener. Declarative costs, exchanges and modifiers belong in `CARD_DEF.meta`. Major- and minor-improvement purchase costs both listen on `actions: ['improvement']`.

`computeCosts` is a pure query evaluated repeatedly during previews and payment execution. Return the card's applicable contribution on every invocation. `context.costs` may contain an incoming computed delta: it is neither the base price nor proof that this listener has already contributed. In particular, do not skip a discount because that field already contains a negative value. The payment solver combines contributions and bounds payable costs at zero.

- `costs`: a simple action-cost delta. Negative values discount and positive values add cost. Use it for ordinary action costs such as construct.
- `trades`: payment substitutions such as using one resource instead of another.
- `bonuses`: discounts or discount choices. Use `choices` for player selection and `optional` for whether the discount may be skipped.
- `paymentResourceProviders`: payment-only virtual resources, such as food on an action space paying an occupation cost. They do not enter `costs` or `PlayerState.resources`; they appear only as special resources in payment choices and consume their declared source.

A result containing `costs` must also include `costAttribution` in the same object. Workshop AST validation and formal Card Source audits reject missing attribution:

```ts
handler: () => ({
  costs: { wood: -1 },
  costAttribution: [{ sourceCard: CARD_ID, costs: { wood: -1 } }],
  sourceCard: CARD_ID,
})
```

A resource discount across every major- or minor-improvement candidate must return a mandatory capped bonus. `costs` is only for simple action fees:

```ts
handler: () => ({
  bonuses: [{
    discount: { wood: 2 },
    capDiscountAtCost: true,
    optional: false,
    sources: [CARD_ID],
  }],
  sourceCard: CARD_ID,
})
```

`capDiscountAtCost: true` floors a smaller fee at zero. `optional: false` removes the undiscounted branch. It discounts only candidates that actually contain that resource and retains nonresource requirements such as `ComplexCost.cards`. If one card also discounts a simple action such as room construction, register separate listeners for `improvement` and that action instead of sharing one `costs` result.

Example `paymentResourceProviders` result:

```ts
return {
  paymentResourceProviders: [{
    key: `${CARD_ID}:traveling-players-food`,
    sourceCard: CARD_ID,
    available: context.state.actionSpaces.find(s => s.id === 'traveling-players')?.resources?.food ?? 0,
    covers: [{ resource: 'food', costAmount: 1, paymentAmount: 1 }],
    consume: { type: 'actionSpace', spaceId: 'traveling-players', resource: 'food' },
  }],
  sourceCard: CARD_ID,
}
```

Do not generate `deriveCardCostCandidate`, `cardCostCandidateMandatory`, `getBaseCosts`, or `CARD_IMPL.modifiers`: these official-card callbacks have no admitted sandbox invocation or registration contract. Declarative `CARD_DEF.meta.modifier` / `modifiers` and `exchanges` do reach the native registry and settlement paths; their placement must not be confused with `CARD_IMPL` fields. `computeExchanges` is admitted and returns `extraExchanges`; omitted filters include its explicit dispatcher identity, under the same trade admission rules.

### 3.4 `scope` values

`sandboxListenerScopes` permits:

<!-- prompt-sync:begin id=listener-scopes -->
- `player`
- `opponent`
- `any`
<!-- prompt-sync:end id=listener-scopes -->

An unlisted scope is rejected. An omitted scope defaults to `player`.

---

## 4. `PlayerState` and `cardStates` fields

These are frequent prompt and documentation mistakes, calibrated against `PlayerState` in `shared/contract/types.ts`.

### 4.1 Player fields

| Field | Type | Use |
|---|---|---|
| `player.workers` | `Worker[]`, each `{ id, isActive, isNewborn }` | Count family members with `.filter(w => w.isActive).length`; a few cards such as A127 make workers inactive |
| `player.fenceSegments` | `FenceSegment[]` | The field is `fenceSegments`, not `fences`. `type` distinguishes ordinary fence and palisade; `source` distinguishes own and borrowed. Legacy string input exists only for normalization, not runtime. |
| `player.fields` | `Field[]` | `.length` is the number of fields |
| `player.pastures` | `Pasture[]` | `.length` is the number of pastures |
| `player.rooms` | `number` | Room count |
| `player.houseType` | `'wood' | 'clay' | 'stone'` | House material |
| `player.resources` | `Partial<Record<Resource, number>>` | Read as `player.resources.wood ?? 0` |
| `player.minorPlayed` | `string[]` | Played minor-improvement IDs |
| `player.occupationPlayed` | `string[]` | Played occupation IDs |
| `player.improvements` | `string[]` | Built major-improvement IDs |
| `player.cardStates` | `Record<string, CardState>` | See section 4.2 |

### 4.2 Shape of `cardStates[id]`

```ts
type CardState = {
  counters?: Record<string, number>            // resources or named card-local counters
  flagged?: boolean                              // one-time trigger flag
  infobox?: string                               // small card-face label
  stack?: unknown[]                              // complex state such as a LIFO queue
  extraData?: Record<string, unknown>            // free-form extension data
  privateData?: Record<string, unknown>
}
```
Internal counters, flags, stacks and `extraData` remain authoritative storage and are absent from ordinary synchronization, including the owner. `privateData` is visible only to the player whose state stores it; passing a card does not transfer another player's private observations. `infobox` and resource statistics are reserved public channels. Other public facts require `getStatePresentation(player)` or a native Card Source `presentation` declaration. The host copies query input and normalizes a closed `CardStatePresentation` result; return public counters, resource groups, crop layers or markers, never raw state. Rule queries use `getRuleContributions(player)` and do not write state.


Read grain stored on the card as:

```ts
const stored = player.cardStates?.[CARD_ID]?.counters?.grain ?? 0
```

Do not write:

```ts
const stored = player.cardStates?.[CARD_ID]?.grain ?? 0 // wrong level; always missing
```

`store-on-card` writes `cardStates[id].counters[resource]`; `take-from-card` deducts from it.

### 4.3 Global state

| Field | Note |
|---|---|
| `state.round` | 1 through 14 |
| `state.players.length` | Player count; there is no `state.playerCount` |
| `state.actionSpaces` | `ActionSpace[]` |
| `state.actionSpaces[i].takenBy` | `WorkerRef[]` containing `{ playerId, workerId }`, not `playerIndex` |

---

## 5. AST-validator denylist

Before compilation, `shared/custom-code/ast-validator.ts` rejects each construct below with an author-facing save error.

It also checks that `CARD_IMPL.effect` keys belong to `cardEffectHooks` plus allowed metadata and that values in `CARD_IMPL.listeners[].phases` belong to `actionHookPhases`. An unknown hook or phase hard-fails compilation rather than being silently discarded.

### 5.1 Denied bare identifiers

<!-- prompt-sync:begin id=denied-identifiers -->
- `eval`
- `Function`
- `process`
- `require`
- `globalThis`
- `global`
- `window`
- `document`
- `__dirname`
- `__filename`
- `self`
- `importScripts`
- `postMessage`
- `WorkerGlobalScope`
- `indexedDB`
- `fetch`
- `XMLHttpRequest`
- `WebSocket`
- `setTimeout`
- `setInterval`
- `setImmediate`
- `clearTimeout`
- `clearInterval`
- `Deno`
- `Bun`
- `Proxy`
- `Reflect`
<!-- prompt-sync:end id=denied-identifiers -->

### 5.2 Denied property access through `obj.x` or `obj['x']`

<!-- prompt-sync:begin id=denied-property-access -->
- `constructor`
- `__proto__`
- `__defineGetter__`
- `__defineSetter__`
- `__lookupGetter__`
- `__lookupSetter__`
<!-- prompt-sync:end id=denied-property-access -->

### 5.3 Denied language constructs

| Construct | Rule |
|---|---|
| `import` declaration | All static imports are forbidden |
| Dynamic `import(...)` | Forbidden |
| `export` declaration or `export =` | Forbidden |
| `require()` call | Independently rejected even apart from the identifier denylist |
| Class declaration or expression | Forbidden |
| `with` statement | Forbidden |
| Generator function or expression | Forbidden |

### 5.4 Allowed examples, not exhaustive

- Ordinary `const`, `let`, `function`, and arrow functions.
- `for`, `while`, `if`, `switch`, and `try/catch`.
- Numbers, strings, untagged template strings, arrays, and objects.
- `JSON.parse` and `JSON.stringify`.
- `Math.*`.
- `Array.prototype.*` and `Object.keys`, `Object.values`, and `Object.entries`.

### 5.5 Listener `actions`: a frequent mistake

`CARD_IMPL.listeners[].actions` contains the internal leaf action ID that triggers the listener, such as `place-farmer`, `gain`, or `collect`. It does not contain an action-space ID such as `forest`, `clay-pit`, or `wish-children`. Section 3.2 has the complete list.

To trigger after a player visits a particular action space, listen on `actions: ['place-farmer']` and filter with `context.space?.id === '<space-id>'`:

```ts
// Wrong: forest is not a leaf action ID, so this listener never fires
{ actions: ['forest'], phases: ['after'], handler: (ctx) => ({ flow: ... }) }

// Correct: listen on place-farmer and filter by space ID
{
  actions: ['place-farmer'],
  phases: ['after'],
  handler: (ctx) => {
    if (ctx.space?.id !== 'forest') return
    return { flow: gainLeaf(CARD_ID, { wood: 1 }), sourceCard: CARD_ID }
  },
}
```

`harvest-feed` is not a listenable action. Harvest feeding performs direct resource mutation outside the listener pipeline. For food granted at the start of feeding, return `gainLeaf(CARD_ID, { food: N })` from `onStartHarvestFeedingPhase`. Its flow completes after the feeding phase starts and before food is consumed. `onHarvest` runs earlier, before the post-reap anytime window.

### 5.6 Anytime abilities

There is no separate API. Create a listener with `phases: ['anytime']` and omit `actions`:

```ts
{
  cardIds: [CARD_ID],
  phases: ['anytime'],
  handler: (ctx) => {
    if (ctx.player.cardStates?.[CARD_ID]?.flagged) return
    if ((ctx.player.resources?.wood ?? 0) < 2) return
    return {
      flow: {
        type: 'seq',
        // Do not set optional: true; that would allow skipping payment and taking the gain
        children: [
          payLeaf({ cardId: CARD_ID, cost: { wood: 2 } }),
          gainLeaf(CARD_ID, { food: 3 }),
          { type: 'leaf', actionId: 'special-effect', params: { kind: 'set-flag', flag: true }, sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}
```

On each `respond()`, the engine collects anytime listeners, calls their handlers for flows, and exposes them as `interaction.anytimeActions[]`. The player invokes one through `takeAnytimeAction(playerIndex, action.id)`. `action.id` is the listener `registrationId`; a sandbox card uses `{cardId}:listener:{index}`.

### 5.7 `futureMeeplesNode` is not available

Official cards use the `futureMeeplesNode(request)` builder, but the sandbox does not inject it. Write a leaf directly:

```ts
return {
  type: 'leaf',
  actionId: 'future-meeples',
  sourceCard: CARD_ID,
  params: {
    __futureMeepleRequest: {
      cardId: CARD_ID,
      playerId: player.id,
      entries: [{ round: state.round + 1, resources: { wood: 1 } }],
    },
  },
}
```

`futureMeeplesAction.execute()` recognizes `params.__futureMeepleRequest`, queues each entry in `state.pendingFutureMeeples`, and places it on the round action card at the start of its round. `FutureMeepleRequest` also supports `{ startRound, count, resources }` for consecutive rounds; see `shared/contract/types.ts`.

Preplaced rewards on future rounds must use this scheduling path so their visible entries, delivery and cleanup belong to the engine. Storing counters on the card and paying them from a flagged `onRoundStart` hook does not create future round placements.

### 5.8 ActionFlow structure

A leaf uses `{ type: 'leaf', actionId, params, sourceCard: CARD_ID }`. Composite nodes use `children`, with type `seq`, `or`, `xor`, or `parallel`:

```ts
{ type: 'seq', children: [gainLeaf(CARD_ID, { food: 1 }), gainLeaf(CARD_ID, { wood: 1 })] }
```

`optional` is a boolean on a node, not another node type. Flow effect hooks return the flow directly; listeners return `{ flow, sourceCard: CARD_ID }` (or their documented query result).

Before execution, the AST validator rejects inspectable composite literals that omit `children` or provide a statically non-array value. This includes direct flow-hook returns, nested literal children, and listeners' `flow` / `alternativeFlow` results. It does not mistake arbitrary leaf parameters or private card data for flows, and does not infer dynamic helper results or spread-provided children. Static success still requires behavioral playtesting.

---

## 6. `actionId` behavior

These are frequent mistakes. `shared/actions/effects/*` contains the complete repository list.

<!-- prompt-sync:begin id=action-ids -->
- `gain`
- `pay`
- `bonus-vp`
- `bake-bread`
- `store-on-card`
- `take-from-card`
- `push-to-card-stack`
- `special-effect`
- `future-meeples`
- `plow`
- `sow`
- `fence`
- `stables`
- `construct`
- `renovate-house`
- `improvement`
- `occupation`
- `family-growth`
- `breed`
- `reap`
- `exchange`
- `set-first-player`
- `selection`
- `emit-choice`
- `reorganize`
<!-- prompt-sync:end id=action-ids -->

| Action ID | Constraint |
|---|---|
| `bonus-vp` | Always awards exactly one VP and accepts no `amount` or `vp`. For N points, sequence N leaves. |
| `store-on-card` | Params look like `{ wood: 1, clay: 2 }` and write `player.cardStates[CARD_ID].counters`. |
| `take-from-card` | Params look like `{ grain: 1 }`; deduct from `player.cardStates[CARD_ID].counters`, and fail the leaf when insufficient. |
| `gain` | Params look like `{ food: 2, wood: 1 }`. |
| `pay` | Same shape, deducting resources. |
| `bake-bread` | Starts a bread-baking subflow. |
| `push-to-card-stack` | Pushes one item onto `player.cardStates[CARD_ID].stack`. |
| `special-effect` | Sandbox entry for card-state mutation. Params use allowed `kind` values such as `set-flag`, `set-infobox`, `set-counter`, `increment-counter`, `set-extra-data`, and `increment-extra-data`. It replaced five legacy mutation leaves. Section 6.1 lists the Workshop subset; unlisted repository-internal kinds are outside this contract. |
| `future-meeples` | Sandbox form uses `params.__futureMeepleRequest`; see section 5.7. |

Sprint 6b on 2026-04-30 removed five separate mutation IDs, `flag-card`, `unflag-card`, `set-card-infobox`, `clear-card-infobox`, and `write-card-extra-data`, plus three dead IDs, `hold-worker-on-card`, `release-worker-from-card`, and `gain-other-players`. Use the `special-effect` discriminated union. CI `check-prompt-sync` ensures the prompt exposes only allowlisted IDs. A sandbox card must not use another ID.


Ordinary farm actions retain native adjacency, components, payment and prerequisites. Occupation `allowedCards` / `exactCost` belong in params; improvement `types` / `allowedPurchases` also belong in params, and the restriction covers major, minor-only and injected candidates. `minimumResourcesPaid` belongs in the leaf’s top-level `actionContext`, not `params.actionContext`, and constrains actual payment, including substitutions. Farm pending uses `commitSelectionChoice`, without internal `farmPayload` shortcuts. `selection` supports explicit farm-position candidates only. `reap` requires `actionContext.trigger: {phase: 'private-field-phase', cardId: CARD_ID}`; `breed` uses this card as source; `reorganize` permits ordinary anytime only. `fencePolicy` admits own-fence `segmentBounds` (fence/total), `newPastureBounds` and `cancelPolicy` only. The deployed descriptor's paramKeys/contextKeys identify exact allowed fields; dynamic nested flows, listener overrides and declarative exchanges cross the same admission gate. Targeted subtrees require an existing player ID; mandatory choice composites require children, and multi-select declarations require a string prefix with ordered nonnegative integer bounds. Multi-select minimums count distinct enabled values; selectable values must be nonempty and contain no commas. Farm candidate coordinates must be distinct integer positions of the actual target farm, including existing extensions, and selection minima must be achievable. Improvement type restrictions are nonempty lists of major/minor; stable and exchange caps are nonnegative integers. Fence segment/pasture bounds require ordered integer ranges. Ordinary choices require an enabled option; multi-select with zero minimum may still submit an empty selection. Occupation filters and stack items retain their declared string shapes.

Custom `pay` cannot supply `playedCards`, `candidateMetadataByFeeIndex` or `costResourceRemovals`: ownership and attribution come from the authoritative engine. Direct custom `pay.cost.cards` is deferred until a host-owned card-eligibility adapter exists; declarative card-return purchase costs in `CARD_DEF.meta.cost.cards` keep the native ownership path. Choice options cannot impersonate another source card. Scoring queries validate their arrays, player identities, resource costs and finite scores before native consumers; malformed results become card warnings. Bonus and trade modifiers reuse native declaration invariants; virtual payment-provider keys must belong to this card, and payment choice/prefix values must be strings. Structured occupation/improvement prerequisites require ordered nonnegative integer bounds.

Listener `flow` and `followUpActions` default to `context.effectPlayer`; replacement `alternativeFlow`, `actionId` and current-action `extraData` use `context.player`. Farm candidate validation follows that native actor, including after a targeted player switch.

Payment trade declarations exclude exchange-only `triggers`, `fromFarmyard` and `blockedAnytimeInteractionKinds`; these fields are accepted only on exchange declarations. Exchange maxima and complex-cost `nb` are nonnegative integers. Bonus and modifier conditions accept only numeric `minNumRooms` and `houseTypeWood` / `houseTypeClay` / `houseTypeStone`; room minima are nonnegative integers. Printed `vp` is finite numeric data. Range-based future requests require a resources map and whole round/count values. Sow minimums are checked by the native projection at actual dispatch, using logical field groups and compatible seeds after earlier actions and all before-phase continuations have completed. Native sow settlement requires at least one selected field, even with a declared zero minimum. Unreachable explicit bounds reject and roll back the current command instead of creating an impossible pending interaction.

Metadata altCosts entries are flat payment resource maps; returnCards is a string array and requires returning an owned card in addition to the printed fee; cost.cards is an alternative payment unless required is true. remove-resource modifiers require a nonempty supported resource array. Complex resourceReserve declares resource keys and a finite nonnegative minimum. Exchanges with no positive input require a nonnegative integer max. Breed selections contain distinct enabled animals; animal zones validate all admitted optional data fields before native placement.

Future scheduling admits ordinary resources and field/stable, without entry actionContext or native sourceSummary. Additional local special-effect kinds are `pop-card-stack-top`, `set-infobox(text)`, and `remove-future-meeples(rounds?)`; cancellation affects this card and effect player only. Other kinds are rejected explicitly.

### 6.1 Allowed sandbox subset of `special-effect.params.kind`

Each mutation is a `special-effect` leaf with `sourceCard: CARD_ID`. Its `params` use one of the shapes below.

```ts
// Write player.cardStates[sourceCard].counters[key]
{ kind: 'increment-counter', key: 'uses', amount: 1 }
{ kind: 'set-counter', key: 'uses', value: 0 }

// Set or clear player.cardStates[sourceCard].flagged
{ kind: 'set-flag', flag: true }
{ kind: 'set-flag', flag: false }

// Set player.cardStates[sourceCard].infobox; empty string clears it
{ kind: 'set-infobox', text: 'active' }
{ kind: 'set-infobox', text: '' }

// Write player.cardStates[sourceCard].extraData[key]
{ kind: 'set-extra-data', key: 'foo', value: 1 } // internal

// Add amount to player.cardStates[sourceCard].extraData[key]
{ kind: 'increment-extra-data', key: 'used', amount: 1 }
```

The repository may use nonsandbox kinds such as `emit-card-triggered` for visible card-trigger event logs. They are not part of the Workshop contract and are not recommended by the LLM prompt.

Cross-player flows use the admitted top-level `targetPlayerId`, identifying an existing player. `special-effect` actionContext does not admit a target override; its source stays this card. `set-private-data` is native-only and is rejected in Workshop because its private-observation lifecycle is not admitted.

Repository-internal single-card actions with a `card_*` prefix, such as `card_E112_GrainThief_protect`, register through `registerAdHocAction()`. Workshop provides no registration interface for them and generated cards must not depend on another card's native action. Source validation and runtime admission reject unsupported leaves, including `card_*` actions. Presence in a native registry is not proof of Workshop support; use the deployed capability contract.

---

## 7. Output format: `CARD_DEF` and `CARD_IMPL`

Custom source must expose two top-level constants:

```typescript
const CARD_ID = 'CUSTOM_MyCard'

// Required card definition
const CARD_DEF = {
  cardType: 'minor',            // or occupation
  meta: {
    id: CARD_ID,
    name: 'Card Name',
    deck: 'CUSTOM',
    number: 0,
    desc: ['Effect description'],
    cost: { wood: 1 },
    vp: 0,
    implemented: true,
    locales: {
      zh: { name: 'Chinese name', desc: ['Chinese description'] },
    },
  },
}

// Optional card implementation; omit for an effectless card
const CARD_IMPL = {
  effect: {
    id: CARD_ID,
    onRoundStart: (_state, _player) => gainLeaf(CARD_ID, { food: 1 }),
  },
  listeners: [
    {
      cardIds: [CARD_ID],
      actions: ['plow'],
      phases: ['after'],
      handler: (_context) => ({
        flow: gainLeaf(CARD_ID, { clay: 1 }),
        sourceCard: CARD_ID,
      }),
    },
  ],
}
```

Important rules:

- The engine handles ownership. Effect hooks and listeners do not manually check `player.minorPlayed.includes(CARD_ID)` or `player.occupationPlayed.includes(CARD_ID)`.
- Every `CARD_IMPL.effect` key belongs to the section 3.1 allowlist.
- Every `CARD_IMPL.listeners[].phases` value belongs to the section 3.2 allowlist.
- Do not use `import`, `export`, `registerCardEffect`, or `registerCardListener`.

---

## 8. Browser-local executor parity

The browser-local executor in `client/local-sandbox/browser-executor.ts`, used when `VITE_SANDBOX_EXECUTOR=browser`, runs a user's own source in the browser without an isolate. Its premise is that the user can affect only their own browser. Its injection contract exactly matches server `server/custom-code/engine.ts`:

- It exposes the same `MinorImprovement(def) => def`, `Occupation(def) => def`, simplified `console`, and every helper in section 1 through the same string constants in `shared/custom-code/injected-helpers.ts`.
- Inputs use `JSON.parse(JSON.stringify(...))` and outputs complete a JSON round trip.
- Hook, phase and output admission uses the same shared functions and section 3 allowlists.
- It captures the same `CARD_DEF` and `CARD_IMPL` constants.

`server/__tests__/local-sandbox-parity.test.ts` compares validation and compilation, effect and listener results, and error tolerance for identical source on both executors.

The local sandbox is a dry run for multiplayer play. Semantic divergence would break the core promise that a card working locally can be submitted for multiplayer.

---

## 9. Synchronization responsibilities

### 9.1 After this document changes

- `server/workshop-sandbox-contract.ts` derives deployed hooks, phases, scopes, action IDs and helper bodies from shared source and descriptive metadata. `client/services/llm/generation/prompt.ts` includes that contract, guarded by `client/services/__tests__/generation-prompt.test.ts`. CI `pnpm run check:prompt-sync` compares every marked block here with source. The browser reads this document and examples from current GitHub main, pinned per attempt; they are not bundled with the site.
- `docs/ARCHITECTURE.md` only needs to point to this file.
- `client/app/workshop/AiCardDesigner.tsx` only needs to point to this file.

### 9.2 After hook, phase, scope, or denylist source changes

- A change to `cardEffectHooks` in `shared/projections/card-effect-hooks.ts` updates the section 3.1 block.
- A change to `sandboxListenerPhases` in `shared/custom-code/sandbox-listener-phases.ts` updates section 3.2.
- A change to `sandboxListenerScopes` in `shared/custom-code/sandbox-listener-scopes.ts` updates section 3.4.
- A change to `DENIED_IDENTIFIERS` or `DENIED_PROPERTY_ACCESS` in `shared/custom-code/ast-validator.ts` updates sections 5.1 or 5.2.

CI catches a missing set update.

`check:prompt-sync` prevents only name-set drift. A payment-solver, executor argument, JSON boundary, or injected-helper change also updates `client/services/__tests__/generation-prompt.test.ts`, corresponding executor or parity tests, and semantic contract tests. When generation strategy changes, add or tighten a real `GameSession` fixture, freeze the implementation, and run the complete browser acceptance batch under the approved budget. Preserve earlier failures and distinguish synthetic runs and historical golden replay from model admission; see `docs/test/llm-card-gen.md`.

---

### 9.3 Capability completion review (2026-10-08)

The owner confirmed expansion of suitable real Workshop capabilities and one shared generation, validation and execution scope; see [ADR 0025](adr/0025-workshop-capability-contract-is-an-execution-boundary.md). This section records the pre-completion audit at c136edc83 and adaptation decisions. Section 9.4 is the implemented first slice; remaining rows are deferred design work and do not enlarge the deployed surface.

| Audited mechanism | Current limitation | Proposed treatment and reason |
|---|---|---|
| `beforeEndGameScope`, `beforeEndGameMandatory` | Already extracted and executed, but absent from the model contract | Describe both fields and their owner/all-player and mandatory semantics. |
| Listener `zones`, `mandatory`, `preScoring`, `replacesTurn`, `blockedAnytimeInteractionKinds` | Source accepts the fields but manifests discard them | Preserve their declarative data through both executors and registration; verify hand triggers, scoring windows, mandatory effects and turn completion. |
| Declarative `modifier` / `modifiers` and `exchanges` | Already supported in `CARD_DEF.meta`; documentation conflated them with unsupported implementation fields | Define the actual placement, schemas and settlement restrictions. `reward` metadata has no current consumer; immediate rewards require `onBuy` flow. |
| `computeExchanges` | Explicit phase rejected; unfiltered listeners can still reach it | Admit and validate the pure query explicitly, including exchange windows, and close implicit listener-filter expansion. |
| `computeResourceCommitments`, `countExtraTurns`, `enforceReorganizeOnLastHarvest` | Native queries absent from the sandbox hook set | Suitable JSON queries; constrain result domains and preserve the pairing of `countExtraTurns` with `contributeExtraTurn`. Resource commitments affect payment admission, not just display. |
| Breeding threshold/count, animal score adjustment, shared animal zones | Pure native queries need four or five arguments; the executor preserves only three | Add complete serializable arguments and return contracts. Score adjustment currently has a horse-scoring consumer in Farmers of the Moor; do not promise all-animal applicability. |
| Existing `resolveChoice`, `getInvalidAnimals`, `onBuy` context | Fourth argument is lost; functions inside context are removed by JSON | Preserve serializable context and state; functions such as protected-observation/event callbacks require a separate host-owned protocol, not direct exposure. |
| `projectInteractionRequest` | Missing four-argument bridge; native hook can change an interaction | Needs a bounded projection contract. It must not manufacture settlement commands or bypass authoritative option validation. |
| Standard actions and the nine documented IDs | Custom return flows can currently use other registered actions | Audit and admit complete ordinary action semantics, then validate custom flows, nested nodes and parameter variants at their origin. Trusted internal engine work retains its native contracts. |
| `special-effect` | One documented action covers 29 native `kind` variants, while the contract describes five local variants | Admit parameter variants individually. Local counters, flags, data and presentation differ from component supply, farm writes, global action-space transfers and internal cleanup. |

The following native interfaces or control declarations must not be exposed merely by copying their names:

| Interface or declaration | Why direct exposure is unsuitable | Mechanism-level alternative |
|---|---|---|
| `computePastureCapacityModifiers` | Returns `appliesTo` / `apply` functions that JSON removes | Serializable capacity contributions or a bounded per-pasture query, settled by the host. |
| `consumeAnimalPayment`, `onAnimalRemoved` | Native implementations change animal/card state in place; copying only their return can report payment or cleanup without applying it | Named authoritative payment and marker-settlement operations. |
| `onComputeSowableFields` + `onSowExtraField` | Candidate query alone cannot settle sowing; native settlement mutates crop storage | Design candidates, crop payment, logical-field ownership and settlement together. |
| `getSpecialStablePositions` + `applySpecialStable` + `returnSpecialStable` | Native writes update positions, once-only state and component supply; sandbox copies cannot persist them | One generic build/return mechanism covering occupancy, supply, card state and event/log semantics. |
| `allowAnytimeReentry` | Disables the active-entry recursion guard | Retain the guard until a bounded reentry/completion design exists. |
| `monotoneFenceCost` | An unproved optimization assertion may prune legal fence candidates | Keep native trusted declarations or derive the guarantee from a restricted cost description. |
| `deriveCardCostCandidate`, `cardCostCandidateMandatory` | Requires a separate candidate callback, mandatory saturation and bounded closure traversal; ordinary listener handlers do not provide these | A dedicated bounded cost-candidate adapter, reviewed as a separate slice. |

An unsuitable native signature does not make the corresponding game rule permanently unsupported. Its generic settlement alternative must be designed before admission. Fixed rule scenarios and Session assertions verify behavior; capability checks do not become a separate behavior judge.

Ordinary `CARD_DEF.meta.cardField` cannot be admitted as metadata alone: native `makeCardFieldImpl` registers candidates, mutating crop settlement and global definitions. A declaration alone cannot sow in the sandbox, while copying global registration would violate session isolation for the same card ID. It is deferred with the extra-sowing pair until a session-local declarative adapter and generated Card Source parity are available; the current contract rejects it explicitly. Native catalog-identity, house/card-holder and FOTM-specific metadata switches are also outside this slice because their catalog consumers and lifecycle paths need separate acceptance. The deployed `cardMetadataKeys` lists the exact admitted set.

### 9.4 First implementation slice and fixed acceptance

The owner selected reuse of reliable existing engine mechanisms for this slice. The following precise scope and fixed test design were confirmed before implementation. This slice now exposes 45 hooks, 11 phases, 31 listener identities (including two query identities), 25 leaf actions and eight local special-effect kinds.

- Add seven pure queries: `computeResourceCommitments`, `countExtraTurns`, `enforceReorganizeOnLastHarvest`, `computeBreedThreshold`, `computeBreedableAnimalCount`, `computeAnimalScoreAdjustment`, and `onComputeSharedAnimalZones`. The hook set becomes 45. Preserve every serializable argument, including fourth/fifth arguments, in both executors; host callbacks remain unavailable. Existing `resolveChoice`, `getInvalidAnimals` and `onBuy` receive their missing serializable context. Horse-only scoring applicability remains explicit.
- Preserve effect metadata `handHooks`, `beforeEndGameScope`, `beforeEndGameMandatory`, `preHarvestGoodsWanted`, `preHarvestGoodsWantedBeforeReap`, `maySkipHarvestFieldPhase`, and `extraTurnBeforeWorkers`. Preserve listener `zones`, `mandatory`, `preScoring`, `replacesTurn`, and `blockedAnytimeInteractionKinds`. Reject unsupported behavioral declarations rather than dropping them. Describe existing declarative card prerequisites, cost modifiers, exchanges in their actual metadata locations; defer Card Field declaration with its paired settlement.
- Admit `computeExchanges`, making 11 phases. Expand listener actions to the corresponding admitted ordinary actions and payment/card-storage events. Omitted filters must resolve to the explicit supported sets, not all future native actions/phases; scope and card ownership remain bound to the custom card.
- Keep the original nine leaf actions and add ordinary forms of `plow`, `sow`, `fence`, `stables`, `construct`, `renovate-house`, `improvement`, `occupation`, `family-growth`, `breed`, `reap`, `exchange`, `set-first-player`, `selection`, `emit-choice`, and `reorganize`, giving 25 IDs. Construction and purchases use their normal authoritative payment, supply and prerequisite paths. Selection is limited to explicit farm-position candidates; arbitrary native selection callbacks and private-hand follow-ups are excluded. Card-triggered breeding/reaping/reorganization must not impersonate Harvest or round-end lifecycle. Ordinary native constraints remain authoritative.
- Admit exactly eight `special-effect` variants: `increment-counter`, `set-counter`, `set-flag`, `increment-extra-data`, `set-extra-data`, `pop-card-stack-top`, `set-infobox`, and `remove-future-meeples`. Bind local writes and schedule cancellation to the custom card and authorized effect player. Other variants are explicit gaps, including private-observation writes and internal lifecycle cleanup.
- Validate both inspectable source and dynamic custom output against the same descriptors, including nested flows, metadata-triggered operations and parameter variants. Apply the boundary where custom values enter the host; native internal children retain their own authority. Align the browser-local executor with the server executor. Continue using the two existing reference tools and user-owned browser-to-model connection.

Deferred items are the section 9.3 native mutation/callback pairs, bounded interaction projection, derived-cost callbacks, reentry and optimization declarations, plus `place-farmer`. The last combines action-space expansion, worker supply and turn rotation; its ordinary and no-worker/temporary-worker variants require a separate complete chain review and fixed Session acceptance. None is enabled by an undocumented escape path.

**Test design:** This is a generic sandbox-boundary adaptation, not a single-card core branch. Mechanical admission/serialization uses existing validator/executor tests. Simple local effects use public direct behavior tests. Payment, choices, phases, cross-player zones and multi-step flows use fixed `GameSession` scenarios. Every Session begins with a new two-player game (seed 42), explicit hands for both players (`['__test_placeholder__']` when irrelevant), the source-owned custom card in the stated hand/played zone, empty initial `cardStates`, normal farm/worker supply and no occupied action spaces unless the scenario states otherwise. Each scenario sets its resources and only the required board/phase facts; it must not depend on random dealt cards.

| Fixed scenario | Preparation and public sequence | Required assertions and non-triggering cases |
|---|---|---|
| Hand/played listener and ownership | P0 holds the custom card; Forest contains 3 wood; run `takeAction(0, 'forest')`, finish its explicit choices, and repeat with the card played or owned only by P1 | Resource deltas and source-attributed log/event; trigger only in the declared zone/scope; no double activation. |
| Phase metadata and scoring window | Round 14, used workers, fixed played cards; before-end gain is mandatory/all-player; prepare 1 wood and a registered exchange; run `invokeAfterRoundEnd`, resolve activation, then `takeAnytimeAction` / `resolveChoice` in the scoring window | Correct target resources, mandatory/pass availability, declared pre-scoring entry and costs, final `gameOver`/scores; absent cards and blocked interaction kinds do not offer it. |
| Complete query arguments | Prepare fixed animal counts/zones and card-local counters; run public breeding/zone aggregators inside Session context, then the corresponding real breed/reorganization commands | Fourth/fifth arguments distinguish source, current count, owner and animal owner; actual animal totals and pending placement agree; unrelated species/source does not change behavior; JSON-copy writes do not alter input state. |
| Commitments and repeated opportunities | P0 has 2 food; the card reserves 2 while its local condition holds; attempt a 1-food payment, release the condition, retry; separately exhaust workers with a two-opportunity provider | Failed commitment preserves state/resources/log; accepted payment settles once; count-driven opportunities are consumed once and do not suppress or invent another player's turn. |
| Farm and purchases | Prepare seeds/building resources, legal empty adjacent tiles and explicit eligible hand cards; enter each admitted action through the custom flow; submit `commitSelectionChoice`, payment `resolveChoice` and card selection explicitly | Fields/crops/rooms/stables/pastures, costs, component supply, hand/played cards, pending completion and logs; reject occupied/disconnected tiles, insufficient resources/supply and unmet prerequisites without partial writes. |
| Private field/breed and ordinary reorganization | Fixed crop stack, two animals and sufficient housing; run the custom extra-reap/breed flow and submit ordinary animal placement | Correct crop depletion, resource/animal deltas and placement totals; no fabricated official Harvest summaries or lifecycle; invalid placement rejected. |
| Choice, selector and exchange | Emit a source-owned choice, resolve its stated value through `resolveChoice`; select an explicit farm tile through `commitSelectionChoice`, then read the stored result in a later flow step; execute a stated registered exchange | Selected outcome, stored local data and exact payment/reward; unknown choice/tile, internal selector callbacks and unregistered trade side effects rejected. |
| Local state and schedules | Fixed own-card and other-card counters/stacks/schedules; call each local public effect; cancel stated future rounds; exercise snapshot restoration | Exact counter/flag/stack/infobox changes and schedule cancellation; preserve another card/player and nonselected rounds; restored state remains equivalent. |
| Closed capability boundary | Fixed invalid declarations and runtime-computed nested flows; submit via the existing validator and both executors | Explicit failure for unsupported keys, phases/actions, foreign local source IDs and forbidden parameter variants; no implicit expansion through omitted filters or declarative metadata. |

Keep all existing fixed LLM fixtures and historical replay. Add precise rule scenarios to the existing test infrastructure; do not introduce a separate behavior judge or commit run-result JSON. Verification includes executor parity, the fixed LLM suite, a real local browser contract/validation flow, `test:fast`, lint and build. The deterministic acceptance path does not contact a model provider.

## 10. History

| Date | Change |
|---|---|
| 2026-08-04 | Made discounts across all improvement candidates mandatory capped bonuses; completed and narrowed the `handHooks` manifest; required a direct accessor-free effect object literal plus host filtering; unified `positionKey({row,col})`; removed Workshop candidate-and-settlement hooks that cannot settle completely; added semantic contracts and M11 live, record, and replay guards. |
| 2026-04-30 | Refactored scoring into two tracks: removed `computePostScore`, `scoringPriority`, and `ctx.reserved`; added `computeCostedBonus` through the Pareto solver. The archived spec and plan remain in Git history. |
| 2026-04-24 | Corrected `computeBonusScore`, `computePostScore`, and `computeSharedPostScore` signatures; added the listener-action-ID, anytime, and unavailable-`futureMeeplesNode` guidance; registered `flag-card` and `future-meeples`. Findings came from the LLM card-generation session suite. |
| 2026-04-22 | Replaced `registerCardEffect` and `registerCardListener` with `CARD_DEF` and `CARD_IMPL`; injected helpers; expanded hook and phase allowlists; made AST validation hard-fail; added four action IDs. |
| 2026-04-19 | Extracted this file as the single source of truth from the old inline section 16 of the design document. |
