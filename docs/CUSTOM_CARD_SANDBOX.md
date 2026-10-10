# Custom Card Sandbox Reference

[English](CUSTOM_CARD_SANDBOX.md) | [中文](CUSTOM_CARD_SANDBOX_zh.md)

This document is the **single source of truth** for what custom-card TypeScript submitted through Workshop or AI Designer can and cannot use inside the isolated-vm sandbox.

Read this document if you maintain:

- AI system prompts: `client/services/llm/generation/prompt.ts` includes the deployed Workshop Capability Contract returned by `server/workshop-sandbox-contract.ts`. Hook, phase, scope, action-ID, helper and semantic facts come from the running backend and shared source metadata; reference examples are read from GitHub on demand.
- Workshop UI copy in `client/app/workshop/AiCardDesigner.tsx` or `WorkshopPage.tsx`.
- Sandbox references in [`docs/ARCHITECTURE.md`](ARCHITECTURE.md).
- LLM automation in `docs/test/llm-card-gen.md`, whose fixtures exercise this contract against a real model.

When this document changes:

1. Treat it as the human-readable mirror of hooks, phases, scopes, and action IDs. Source constants own the name allowlists: `cardEffectHooks`, `sandboxListenerPhases`, `sandboxListenerScopes`, and `SANDBOX_ALLOWED_ACTION_IDS`. Exhaustive maps own descriptions. The deployed Workshop Capability Contract renders them at runtime and the browser includes it in the generation prompt; there is no hand-copied prompt table. CI command `pnpm run check:prompt-sync` checks only that the names in each `prompt-sync` block match source.
2. Make `docs/ARCHITECTURE.md` point here instead of maintaining another copy.
3. Name synchronization does not cover payment semantics, hook parameters and return values, or helper data shapes. Update executor and prompt-contract tests and run the fixed browser acceptance batch described by `docs/test/llm-card-gen.md`; historical golden replay remains a separate regression check.

Official card authors working in `shared/cards/<deck>/<id>.ts` are not subject to this sandbox. They may import project helpers directly. This contract applies only to Workshop custom cards.

---

## 1. Injected globals

The server isolate injects these globals, in `server/custom-code/isolate-runner.ts` for hook and listener calls and in `server/custom-code/engine.ts` for manifest extraction:

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
- Mutation has no effect on host state. A handler must return `{ flow }` and let the engine execute ActionFlow.
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

Only keys in `cardEffectHooks` are registered. The AST validator hard-fails an unlisted key when saving, and manifest extraction rejects one that still reaches it instead of dropping it.

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
- `computeCostedBonus`
- `computeSharedPostScore`
- `computeExtraRoomCapacity`
- `computeHarvestBreedOrderPriority`
- `onComputeAnimalZones`
- `computeLockedFarmTiles`
- `getInvalidAnimals`
- `getBuiltSpecialStables`
- `getRuleContributions`
- `getStatePresentation`
<!-- prompt-sync:end id=card-effect-hooks -->

`onBeforeWork` runs after round growth and future-meeple actions but before `onRoundStart`. Use it only when the card explicitly acts before the work phase.

`onBeforePlayerTurn` is the non-flow skip-control exception. Its signature is `(state, player) => { skipTurn?: boolean } | void`, and it synchronously skips this labor-turn placement opportunity. It cannot return ActionFlow or create pending state.

Reaction-compatible hooks, namely action-listener `before`, `immediatelyAfter`, and `after`; the three Harvest-field hooks; `onBeforeEndGame`; and `contributeExtraTurn`, cannot depend on scan order. Multiple simultaneous items enter trigger-select, and the player selects a source card before execution. A custom card should return a replayable ActionFlow for mutation and never treat a handler invocation as final settlement.

`contributeExtraTurn` returns this card's extra-turn provider flow. When several cards contribute, the system asks for the provider source before expanding that flow. `countExtraTurns` is an internal official-card field and is not exposed to Workshop.

Allowed metadata keys outside `cardEffectHooks` are `id` and `handHooks`.

Advanced-hook details:

| Hook | Special signature | Purpose |
|---|---|---|
| `computeBonusScore` | `(state, player, ctx) => number`, with read-only `ctx.categories` | Free final bonus collected into `cardStateBonusVp` |
| `computeCostedBonus` | `(state, player, ctx) => BonusScoreLevel[]` | Spend resources for VP; declare levels for solver optimization |
| `computeSharedPostScore` | `(state, owner, summaries) => Array<{ playerId, score }>` | Cross-player score such as awarding the owner from the lowest opponent score |
| `contributeExtraTurn` | `(state, player) => ActionFlow | void` | Provider after ordinary workers are exhausted; player selects among multiple providers |
| `resolveChoice` | `(state, player, choice) => ActionFlow` | Handle player choice; sandbox supplies no `ctx` |
| `computeExtraRoomCapacity` | `(player) => number` | Extra housing capacity |
| `computeHarvestBreedOrderPriority` | `(state, player) => number | void` | Harvest breeding order, with larger values later |
| `onComputeAnimalZones` | `(player, zones, state) => AnimalZone[]` | Return only new zones; do not append input zones, and mutation of the JSON snapshot is ineffective |
| `computeLockedFarmTiles` | `(player) => FarmTilePosition[]` | Locked farm tiles |
| `getInvalidAnimals` | `(player, zone, meeples) => Meeple[]` | Card-zone animal restriction; sandbox supplies no `state` |
| `getBuiltSpecialStables` | `(player) => FarmTilePosition[]` | Currently standing special stables for derived snapshot display |
| `getRuleContributions` | `(player) => CardRuleContributions` | Read-only source-owned component reservations and unused-space quantity adjustments; finite, floored, nonnegative and capped by the consuming category |
| `getStatePresentation` | `(player) => CardStatePresentation` | Explicit public counters, resource groups, crop layers and markers; ordinary clients do not read internal storage |
| `handHooks` metadata | `HandCardEffectHook[]` | Stage hooks that also run while the card remains in hand |

A query hook returns its documented top-level type, namely a number, an array, or an object, or nothing. Another type, or a non-finite number, is reported as a failed hook. A failed or empty query contributes a neutral result: an empty array, `0` for `computeBonusScore` and `computeExtraRoomCapacity`, and nothing otherwise.

Extra sowing and special stables each require a paired candidate and settlement contract: `onComputeSowableFields` with `onSowExtraField`, and `getSpecialStablePositions` with `applySpecialStable`. Settlement relies on in-place host mutation that cannot return through sandbox JSON snapshots, so Workshop exposes neither pair. `handHooks` does not support `onBuy`, `onEndTurn`, `onBeforeEndGame`, or `onBeforePlayerTurn`. `CARD_IMPL.effect` must be a direct object literal with no variable reference, spread, computed key, or accessor, preventing static-validation bypass. Server and browser manifests also filter unsupported hand hooks on the host side.

Fence discounts such as E16 Briar Hedge and C16 Field Fences use a `computeCosts` listener on `actions: ['fence']`. C1 Overhaul rebuilds only own ordinary fences through `consume-fence` `ownOnly` and generic `fencePolicy`.

### 3.2 `CARD_IMPL.listeners` allowlists

A listener entry declares only `handler`, `actions`, `phases`, `scope`, and `cardIds`, plus an optional `id` label that the host ignores. Any other field fails on save, because the manifest would drop it.

A listener always belongs to its own card: it reacts only while that card is in play for the player its `scope` selects, and never before the card is played. `cardIds` may be omitted; when present, it must be `[CARD_ID]`.

An omitted `actions` or `phases` filter means the lists in this section, with the anytime identity added for an anytime listener. It never matches action-space identities such as `forest`, or native actions and phases outside these lists.

`actions` accepts only these high-level action IDs. The AST validator rejects an unknown ID:

<!-- prompt-sync:begin id=listener-actions -->
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
<!-- prompt-sync:end id=listener-actions -->

`sandboxListenerPhases` is the Workshop listener-phase allowlist. The AST validator rejects unsupported phases in new source. Saved executable manifests are checked before session or runtime registration; the isolated session factory checks original cards before stripping executable fields from its parent mirror. An unsupported phase rejects creation before any card effects, listeners, or workers are installed. HTTP game creation returns 400 with `code: 'unsupported_listener_phase'` and the specific phase error; WS creation reports the error before persisting the Room. `during` is unsupported and is never translated to `after`. Saved drafts and versions remain readable for editing.

<!-- prompt-sync:begin id=action-hook-phases -->
- `before`
- `immediatelyAfter`
- `after`
- `computeCosts`
- `computeArgs`
- `computeReplace`
- `isDoable`
- `anytime`
- `computeChoiceCandidates`
<!-- prompt-sync:end id=action-hook-phases -->

### 3.3 Payment-mechanism boundary

A Workshop card may affect payment only through the value returned by a `computeCosts` listener. Major- and minor-improvement purchase costs both listen on `actions: ['improvement']`.

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

Do not generate `deriveCardCostCandidate`, `cardCostCandidateMandatory`, `getBaseCosts`, `modifiers`, or `computeExchanges`. They are internal official-card APIs unsupported by Workshop. `deriveCardCostCandidate` and `getBaseCosts` belong to the major- and minor-improvement candidate pipeline; `computeExchanges` injects runtime exchanges. Sandbox manifests do not fully register these fields.

### 3.4 `scope` values

`sandboxListenerScopes` permits:

<!-- prompt-sync:begin id=listener-scopes -->
- `player`
- `opponent`
- `any`
<!-- prompt-sync:end id=listener-scopes -->

An unlisted scope fails on save. An omitted scope defaults to `player`.

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

It also checks that `CARD_IMPL.effect` keys belong to `cardEffectHooks` plus allowed metadata and that values in `CARD_IMPL.listeners[].phases` belong to `actionHookPhases`. An unknown hook or phase hard-fails compilation rather than being silently discarded. A statically visible flow leaf is checked the same way: a literal `actionId` outside section 6, or a literal `special-effect` kind outside section 6.1, fails on save.

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

`CARD_IMPL.listeners[].actions` contains the internal leaf action ID that triggers the listener, such as `place-farmer`, `gain`, or `collect`. It does not contain an action-space ID such as `forest` or `clay-pit`. The one exception is `wish-children`: it is in the list, and a listener on it is called in the `before` phase when a player uses the Wish for Children action space. Section 3.2 has the complete list.

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

`optional` is a boolean on a node, not another node type. A node may also carry `promptKey` and `anytimeWindow`, and a leaf may carry `actionContext` with the single key `targetPlayerId`; any other `actionContext` key is rejected. These fields are type-checked: `optional` is a boolean, `promptKey` and `actionContext.targetPlayerId` are strings, and `anytimeWindow` is `{ allowed: boolean, blockedIds?: string[] }`. A value of another type is rejected, so `optional: 'false'` is an error and not an optional step. The other native node fields are not open to Workshop cards and are rejected when a flow is returned: `mode`, `triggerSelectOnce`, `expandFlow`, `optionId`, `choiceLabelKey`, `choiceLabelParams`, `effectPreview`, `anytimeActionId`, and node-level `targetPlayerId`. Any other field on a node is rejected as well, so a misspelling such as `optoinal` is an error and not a silently ignored key. A `sourceCard` on a node, on a listener result, or on a `followUpActions` entry must be `CARD_ID`. A leaf that omits it, and a listener result that carries a flow without it, is attributed to the card. Flow effect hooks return the flow directly; listeners return `{ flow, sourceCard: CARD_ID }` (or their documented query result).

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
<!-- prompt-sync:end id=action-ids -->

These nine IDs are enforced, not only recommended. Source validation rejects a visible leaf with another ID. Both executors reject a returned `flow`, `alternativeFlow`, `followUpActions` entry, or replacement `actionId` that uses one, including inside nested groups. The whole result is rejected before any node runs; section 9.3 describes what the player then sees.

Each action accepts only the parameter keys in the table below. `gain`, `store-on-card`, and `take-from-card` take resource names; `pay` takes resource names or the single `cost` key that `payLeaf` produces; `bonus-vp` and `bake-bread` take none; `push-to-card-stack` takes `item`; `future-meeples` takes `__futureMeepleRequest`, whose `cardId` must be `CARD_ID`. Native-only controls, such as `payerId` on a gain or `costType` on a pay, are rejected. Amounts, cost rules, and schedules are validated by the native action.

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

// Write player.cardStates[sourceCard].privateData[key]; readCardExtraData does not return it
{ kind: 'set-private-data', key: 'secret', value: 'owner only' }

// Add amount to player.cardStates[sourceCard].extraData[key]
{ kind: 'increment-extra-data', key: 'used', amount: 1 }
```

These seven kinds are the complete sandbox set, held in `SANDBOX_SPECIAL_EFFECT_KINDS`. The repository uses other kinds, such as `emit-card-triggered` for visible card-trigger event logs. They are not part of the Workshop contract, and a `special-effect` leaf that uses one is rejected. So is a listed kind whose fields do not have the types shown above: `key` and `text` are strings, `amount` and `value` of the counter and increment kinds are finite numbers, `flag` is a boolean, and the two data kinds must supply a `value`.

Optional `actionContext.targetPlayerId?: string` routes a mutation to the matching player in `state.players`; it defaults to the actor in `context.player`. Workshop rarely needs it except for cross-player cases such as D134 Oyster Eater.

Repository-internal single-card actions with a `card_*` prefix, such as `card_E112_GrainThief_protect`, register through `registerAdHocAction()` and exist only in repository code. A Workshop card cannot dispatch them: they are absent from `SANDBOX_ALLOWED_ACTION_IDS`, absent from the prompt, and rejected by sandbox runtime. Use `special-effect` or a standard action such as `gain`.

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

The browser-local executor in `client/local-sandbox/browser-executor.ts`, used when `VITE_SANDBOX_EXECUTOR=browser`, runs a user's own source in the browser without an isolate. Its premise is that the user can affect only their own browser. Its injection contract exactly matches the server isolate in `server/custom-code/isolate-runner.ts`:

- It exposes the same `MinorImprovement(def) => def`, `Occupation(def) => def`, simplified `console`, and every helper in section 1 through the same string constants in `shared/custom-code/injected-helpers.ts`.
- Inputs use `JSON.parse(JSON.stringify(...))` and outputs complete a JSON round trip.
- Hook and phase filtering uses the same shared functions and section 3 allowlists.
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

### 9.3 Workshop Capability Contract rules

[ADR 0025](adr/0025-workshop-capability-contract-is-fail-closed-and-opened-by-tests.md) sets the rules for this document.

- **The contract covers names, node fields, each action's parameter keys, the field types of `special-effect`, and the top-level result type of query hooks.** Parameter values and the contents of query results are validated by their native consumers, exactly as for native cards; admission does not mirror those rules.
- **Not listed means not open.** The deployed contract, source validation, and both executors accept the same names: the hooks in section 3.1, the listener actions, phases, and scopes in sections 3.2 and 3.4, the action IDs in section 6, and the `special-effect` kinds in section 6.1. This document does not list unopened native interfaces. Candidates are tracked in [issue #1079](https://github.com/titanxxh/open-agricola/issues/1079).
- **A name is open only with a fixed behavior test.** Each name needs at least one test that drives it through a two-player `GameSession` without changing native rule paths. Open a new capability in its own issue, with that test.
- **A failed hook and an out-of-contract result behave the same way.** When the failure happens while a command is being settled, its first occurrence rejects the command, restores the state before it, and returns the error, which names the rejected action, kind, or field. A repeated identical failure is not reported again: the command then succeeds and that card's effect is skipped. This is deliberate, so a game that contains a faulty card can continue. A failure outside a command, such as a query that runs while availability, a preview, or scores are computed for a response, is recorded as a card warning and contributes the neutral result of section 3.1; nothing is rolled back, because no command is in progress.

Admission serves honest authors and model mistakes. It does not bound adversarial workloads beyond the isolate limits.

---

## 10. History

| Date | Change |
|---|---|
| 2026-10-10 | Made the contract fail-closed (ADR 0025): enforced action IDs and `special-effect` kinds in source validation and both executors, rejected unsupported listener fields and the undocumented `beforeEndGameScope` / `beforeEndGameMandatory` metadata, bound every listener and returned node to its own card and omitted listener filters to the listed sets, rejected unopened native node fields, undocumented action parameter keys, malformed `special-effect` fields and query results of the wrong top-level type, and documented the hook-failure behavior. |
| 2026-08-04 | Made discounts across all improvement candidates mandatory capped bonuses; completed and narrowed the `handHooks` manifest; required a direct accessor-free effect object literal plus host filtering; unified `positionKey({row,col})`; removed Workshop candidate-and-settlement hooks that cannot settle completely; added semantic contracts and M11 live, record, and replay guards. |
| 2026-04-30 | Refactored scoring into two tracks: removed `computePostScore`, `scoringPriority`, and `ctx.reserved`; added `computeCostedBonus` through the Pareto solver. The archived spec and plan remain in Git history. |
| 2026-04-24 | Corrected `computeBonusScore`, `computePostScore`, and `computeSharedPostScore` signatures; added the listener-action-ID, anytime, and unavailable-`futureMeeplesNode` guidance; registered `flag-card` and `future-meeples`. Findings came from the LLM card-generation session suite. |
| 2026-04-22 | Replaced `registerCardEffect` and `registerCardListener` with `CARD_DEF` and `CARD_IMPL`; injected helpers; expanded hook and phase allowlists; made AST validation hard-fail; added four action IDs. |
| 2026-04-19 | Extracted this file as the single source of truth from the old inline section 16 of the design document. |
