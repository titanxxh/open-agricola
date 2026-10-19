# `shared/actions/`: Actions

[English](actions.md) | [中文](actions_zh.md)

This module owns action definitions, effects and internal actions, the farm-type commits and the anytime window policy. Its payment pipeline is described in [payment](payment.md), and the hook registry, Stage Dispatch and listener purity in [hooks](hooks.md). Rules for one card stay in that card's file and reach this module only through the seams below.

## Directory

```text
shared/actions/
├── index.ts               actionDefinitionLookup Map; discovers base plus internal actions
├── flow.ts                ActionFlow: leaf, seq, parallel, xor, or, plus optional metadata
├── hooks.ts               Hook registration and dispatch
├── hook-matrix.ts         buildHookMatrix() optimization matrix
├── internal-actions.ts    Internal engine actions such as mark-card-trigger
├── effects/               Base actions, one action per file
│   └── internal/          Internal effects
├── factories/             Action factories
├── helpers/               Shared payment, animal, and farm helpers
├── payment/               PaymentSolver and executors
└── __tests__/
```

## `ActionDefinition`

```ts
type ActionDefinition = {
  id: string
  nameKey: string
  descriptionKey?: string
  rulesKey?: string
  roundAvailable?: number
  gainPerRound?: Partial<Resource>
  canBeExecutedByPlayer?(state, player): boolean
  canBeOfferedByPlayer?(state, player): boolean
  originalActionCondition?(context): boolean
  isAlreadySatisfied?(context): boolean
  costPreview?(...): CostPreview
  isDoable?(...): boolean
  isAutomatic?(...): boolean
  execute(state, player, params?): ActionExecutionResult
  resolveChoice?(state, player, value, payload?): ActionExecutionResult
  emitLeafActionDetail?: boolean
  flow?: ActionFlow
  flowFactory?(planningContext): ActionFlow
  getBaseChoiceOptions?(...): ActionChoiceOption[]
  choicePromptKey?: PromptKey
  noChoiceLogKey?: string
}
```

- `descriptionKey` is the printed action text; `rulesKey` is a separate localized supplemental ruling with no effect on legality or execution.
- Hooks are not part of `ActionDefinition`. Generic variant rules register with the current Core's `ActionHookRegistry`; card reactions use Card Listeners.
- `getBaseChoiceOptions` is an opt-in choice pipeline: base options, injected `computeChoiceCandidates`, de-duplication by `value`, `costPreview.canExecute` filtering. Zero candidates fail, one resolves directly, two or more prompt. It is mutually exclusive with the `execute() → choice → computeArgs.extraOptions` path.
- `flowFactory` is a pure, data-only plan used by both execution and descriptions.
- `canBeOfferedByPlayer` separates non-payment eligibility from affordability for explicit optional offers: an eligible but unaffordable offer stays visible with Accept disabled, and eligibility never authorizes execution.
- `originalActionCondition` and `isAlreadySatisfied` are described in [Public ActionNode execution order](hooks.md#public-actionnode-execution-order) and [Current-step admission and blocked recovery](hooks.md#current-step-admission-and-blocked-recovery).

Tests: `shared/engine/__tests__/engine-choice-candidates.test.ts`, `shared/actions/effects/__tests__/improvement-offer.test.ts`.

## Effects and internal actions

- `shared/actions/index.ts` imports only top-level base effects and `effects/internal/` to build `actionDefinitionLookup`. `scripts/check-effects-file-list.ts` is the single allowlist of top-level effect files, reused by `shared/actions/effects/__tests__/architecture-guard.test.ts`.
- One action per file. An effect file never accumulates logic for several cards: host-action substeps use `internalChildren`, internal effects live in `effects/internal/`, and pure helpers in `shared/actions/helpers/`.
- A listener that needs a state change with no existing leaf gets a reusable internal action, never a mutation inside its handler ([Listener purity](hooks.md#listener-purity)).

Generic internal actions and their contracts:

| Action | Contract |
|---|---|
| `collect` | The only entry for taking goods from an accumulation space, including partial and cross-space takes through `actionContext: { spaceId?, resource?, amount? }`. A card-provided accumulation space declares `gainPerRound` and stores goods in `ActionSpace.resources`. |
| `gain` | Resolves recipients before settlement. A payer-backed gain checks the full transfer before moving anything; events keep the payer as source. Explicit resource parameters are distinguished from an Action Space's configured base gain. |
| `return-to-space` | Returns goods to the space named by `actionContext.targetSpaceId`; payment and the movement event use the same target. |
| `place-farmer-on-space` | Places an additional worker on a fixed target and normally expands that target's flow; `params.executeTarget: false` places the worker without expanding it. `allowOccupied` relaxes only occupancy, never blocking, round availability, executability or worker supply. Cards never write `ActionSpace.takenBy` in a handler. |
| worker-less use and fixed-target jumps | A card may run a full Action Space flow without placing or consuming a person (`place-farmer.actionContext.viaCardJump`), or jump a bound worker to a fixed target (`jumpLeaf`). Query and execution bind the same worker; costs, vetoes, linked blocks and recursion guards still apply. |
| granted rule actions | A card that grants a rule action invokes that action directly; granting an action does not expand the whole Action Space that normally offers it. |
| `pass-minor-card-to-left` | Moves a played minor to the left player's hand, clears its card state and emits public `card.passed` plus a private hand change. Later triggers consume `card.passed`. |
| `individual-food-cost` | An occupation's mandatory individual food cost, separate from the Occupation Cost and PaymentSolver: pays available food, begs for the shortfall, needs explicit confirmation on a shortage, and reads live inventory at preview and settlement. |
| `take-from-card` | Deducts the source card's counters, then hands the credit to a `receive` child, so Receive reactions observe goods moved off a card and Gain reactions do not. |
| `pop-card-stack` / `claim-farmyard-goods-tokens` / `claim-field-goods-tokens` | Remove a card's stack top or its claimable farm goods tokens and hand real goods to a `receive` child. Farmyard tokens are claimed by source and, optionally, committed coordinates; a non-goods stack item only changes the stack. |
| `special-effect` | The generic mutation dispatcher for listener-returned leaves: counters, flags, infobox, card stacks, supply tokens and farmyard space states. It never credits goods to a supply. `countCardUse: false` marks housekeeping that must not count as a card use. |
| `receive` | The only credit for existing goods entering a supply ([ADR 0030](../adr/0030-existing-goods-enter-supply-through-receive.md)). It settles mature future goods for one player in one transaction (see [Stage hooks](hooks.md#stage-hooks)) and credits goods a source action already removed from its card (`params.fromCard`). `gain` only brings new goods from the general supply. |
| `activate-card` / `activate-card-effect` / `activate-extra-turn` | Activation leaves for listeners, stage effects and extra-turn providers; see [Stage hooks](hooks.md#stage-hooks) and [Listener purity](hooks.md#listener-purity). |
| `reap` | Ordinary and private-field harvest; see [Stage hooks](hooks.md#stage-hooks). |

- Occupation availability, choice submission and direct or free play share one prerequisite gate. Improvement cost preview and payment use the granting `sourceCard` or physical action-space ID as `actionCardId`.
- Selection follow-ups carry semantic provenance in `actionContext` (for example `extraCropPlacement`); later cards read the marker, never the source card ID.
- A resource listener subscribes to the action that credits the goods (`gain`, `collect`, `receive`, `reap`, `exchange`), never to a source action that hands its credit to `receive`; one movement must not reach the same listener twice. A listener about a card's own counters or stack may subscribe to the source action.

Tests: `shared/actions/effects/__tests__/{collect,gain,place-farmer-on-space,place-farmer-jump,take-from-card,pop-card-stack,special-effect,farmyard-goods-claim}.test.ts`, `server/__tests__/{empty-accumulation-admission,receive-existing-goods}-session.test.ts`.

## Farm-type commit

Each farm type closes its logic inside its own `ActionDefinition.resolveChoice` under `shared/actions/effects/`:

- **Room** (`construct.ts`): `room-payment.ts` expands per-room cost variants; a printed per-room discount uses `scope:'unit'`. House animals persist per real room in `houseAnimals`.
- **Stable / plow** (`stables.ts`, `plow.ts`): typed-flat payment; stable pricing derives one unit fee from the default, `exactCost` or `costOverride` and one complete farm-choice query. `plow.actionContext.allowedTiles` / `adjacencyPolicy` affect only that plow.
- **Fence** (`fencing.ts`): validate edges, sources, connectivity and regions; compute cost through the farm-choice `computeCosts` pass; pass trades, bonuses, providers and budget into `pay:fence:*`. `before` contributions write back to the host by source: wood discounts add no entity, and card-held fences are chosen explicitly and consumed only for ordinary fences built in this action.
- **Sow** (`sow.ts`): no payment combination. `maxSelections` counts Logical Fields, `maxSeedSelections` caps crop slots; action crop permissions intersect the field owner's; `isUnconditionalSow` keeps explicit restrictions.

First-round payloads are `fence: {edges, palisadeEdges, extraWood, fenceSources?}`, `room: {rooms}`, `stable: {stables}`, `plow: {tile}`, `sow: {crops}`, submitted as `{type:'choice', value:'confirm', payload}`. A second payment round persists the payload in `pending.actionContext.farmPayload`. Entry doability for construct and fence rejects states with no reachable commit.

### Fence segments and policy

- `FenceSegment.type` (ordinary fence or palisade) and `FenceSegment.source` (whose token) are independent. A borrowed fence is an ordinary segment with `source.kind='borrowed'`.
- The fencing main path never branches on card IDs or per-card flags. Card behavior uses `fencePolicy`: `allowedSegmentTypes`, `sourcePolicy`, `segmentBounds`, `newPastureBounds`, `newRegionBounds`, `pastureBounds`, `connectionPolicy`, `allowedNewRegionTiles`, `allowTerrainInNewRegions`, `suppressTerrainRegions`, `costPolicy`, `paymentBudget`, `cancelPolicy`, `preserveAnimalTotals`, `promptHintKey`.
- `sourcePolicy: { kind: 'borrowed', donorCaps }` requires `fenceSources` covering every new ordinary edge; the server reclamps caps against live donor reserve and consumes donor supply.
- `newPastureBounds` / `newRegionBounds` bound the count and total size of new pastures or regions. `pastureBounds` is a separate check: `newPastures` bounds the net pasture-count increase, `changedPastures` the number of new or reshaped pastures, and `newPastureSize` the size of each of those pastures.
- `segmentBounds.total` limits ordinary fences plus palisades together. `canStartFencing` preflights at least one legal commit with `validateFenceSelection()`, which stays the final atomic validator.
- `costPolicy` sets only this action's base unit cost; `computeCosts.fence` discounts still apply. `paymentBudget` filters only final payment, never geometry. `promptHintKey` is copy only.

Tests: `shared/actions/__tests__/fencing.test.ts`, `shared/actions/effects/__tests__/{fence-resolveChoice,fencing-entry-guard,construct-resolveChoice,sow-permissions}.test.ts`.

## Anytime window policy

`computeAnytimePolicy()` in `shared/session/anytime-policy.ts` computes card-listener anytime availability once per `buildInteraction()`; clients never import it. `GameCore.getAnytimePolicyInput()` supplies the active context, `stageResume`, the request kind and the request's `anytimeWindow`.

- A flow or request may declare `{ allowed: true, blockedIds? }` or `{ allowed: false }`. The declaration belongs only to the current waiting node; parents, siblings and continuations confer nothing.
- Priority: no context; heating; engine-blocked; next-player confirmation (exchange blocked); player-switch confirmation; animal reorganization; the explicit current window; the default stage-hook-chain block; ordinary allowance. Metadata cannot override an earlier hard block; malformed windows close.
- Three consumers share the snapshot: `buildAnytimeEntries()` filters entries; `buildInteraction()` exposes `takeAnytimeAction` only when allowed and non-empty; `takeAnytimeAction()` enforces the policy before injection.
- Card entries share current-step admission ([Current-step admission and blocked recovery](hooks.md#current-step-admission-and-blocked-recovery)); a root `optional` does not bypass it, and the new action uses its own source, parameters, costs and actor.
- Nested anytime flows insert ahead of the current pending tree; the parent returns as the same `PendingEnvelope`.
- Re-entry: while an Anytime Ability's sequence is running, the same entry is excluded for that player across frames. `allowAnytimeReentry` lifts only this restriction and is set only by the system `exchange`. Goods or target options inside one ability share its entry.
- Each accepted command freezes its Turn affiliation and parent activation ID on its existing `anytimeActionId` sequence. The sequence emits `anytime.completed` only after all descendants and required reorganization finish, including same-frame injections. Its fact uses the ordinary captured `actionEvents` and `after` trigger-select; nested completion does not finish the parent activation. Identity, affiliation and parent link survive the session cursor and undo; cleanup leaves carry no completion marker. See `server/__tests__/anytime-completion-session.test.ts`.
- A turn-replacing anytime action (`replacesTurn`) is available only from an idle work phase and rotates after its whole flow and end-turn hooks.
- **Exchange Batch**: `executeExchangeBatch()` in `effects/exchange.ts` validates exact ordered quantities, recipe and source limits, resources and placed-animal balances before any payment. Earlier recipe credits can fund later recipes; unclaimed reaction rewards cannot. An invalid item rejects the whole submission without clamping or partial settlement. Ordinary direct, single, bulk and submitted feeding recipes share the executor; each receipt captures its own pre-payment inventory. The engine runs batch reactions before any needed reorganization. Recipes may block anytime use in named interaction kinds (`blockedAnytimeInteractionKinds`); during breeding, animal cooking recipes are unavailable. Compact values such as `bulk:` use the request's `structuredChoicePrefixes`.
- **Exchange catalog**: `getExchangeCatalog()` resolves declared and runtime recipes for explicit windows. Declaration lookup and the Harvest usage ledger live in `helpers/exchange-recipes.ts`, shared by ordinary exchanges, Harvest craft opportunities and feeding; cancellation consumes no use. Each resolved recipe owns its Harvest usage round, so anytime-only entries do not acquire a Harvest limit from the enclosing feed. The `feed` request publishes `exchangeCatalog` entries keyed by `(sourceId, exchangeIndex)`; submission matches both the offered and live catalog.
- Reorganize is a system subflow, never an anytime entry. Idle work turns and `confirm-next-player` are acting-player windows; `confirm-player-switch` and stage-hook chains are blocked unless the current node opens a window. `computeResourceCommitments()` limits are enforced at the command boundary ([ADR 0019](../adr/0019-resource-commitments-preserve-unsettled-trades.md)).

Tests: `shared/session/__tests__/anytime-policy.test.ts`, `server/__tests__/{anytime-reentry-session,anytime-nested-pending,anytime-policy-negative,anytime-admission-session,exchange-batch-session}.test.ts`.

