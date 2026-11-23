# Card Authoring Guide

[English](CARD_AUTHORING.md) | [中文](CARD_AUTHORING_zh.md)

Use this guide to implement one card: keep the Card contract, map the printed text to an existing mechanism, copy the closest example card, and copy that card's Session test. Repository agents and the Workshop model both read it. Each section names example cards and tests; read them for the exact field names. The [architecture index](ARCHITECTURE.md) and its module documents explain the mechanisms. This guide only points from card text to them.

## Card contract

Every card keeps every rule below. Check each rule against the card before calling it done, and again when reviewing one. A rule states what the card does; its link is the module document or ADR that defines the mechanism, and the named cards show it in code.

- **Closure.** The card is feasible as §1 defines: one closed file that changes no core path and adds no hook point, phase, action or engine node. It reaches other cards through capabilities and typed metadata. See [cards: boundaries](architecture/cards.md#naming-capabilities-and-boundaries). Gates: `pnpm run check:card-impl-boundaries` rejects a card reading another card's ID, `pnpm run check:card-state-boundaries` rejects core code reading one card's state.
- **Local state.** Counters, flags and markers persist in `player.cardStates[cardId]` and stay internal until `presentation` declares them public. A public counter whose key is not a resource needs a `ui.cardCounters.<key>` label in the language source. See [cards: local state](architecture/cards.md#local-state-in-cardstates). Gate: `client/components/board/__tests__/card-counter-label.test.ts`.
- **Purity.** A listener handler reads state and returns flows, costs or options. Every mutation, including a write to the card's own state, is a returned leaf. See [hooks: listener purity](architecture/hooks.md#listener-purity). Gate: the listener-purity guard in every test project.
- **Timing.** The subscription and the phase follow the printed text through the tables in §3 ([ADR 0033](adr/0033-card-listener-timing-follows-project-semantics.md)).
- **Admission.** Before offering an option, the card checks what it controls itself: its printed prerequisite and a target that must be usable now, such as a revealed Action Space or a granted action that can start (`CWM061_BackDoor`), and its own fee, passed as `reserve` so the target is judged after paying it (`CWM023_ForestFarmer`, `C150_ParrotBreeder`). Later host steps belong to the engine, which checks only the current step: when a choice the player accepted leaves a later mandatory step unpayable, the Session shows `engine-blocked` until `undoStep` / `undoAction` (`D014_HammerCrusher`, `CWM042_Remodeler`). See [hooks: current-step admission](architecture/hooks.md#current-step-admission-and-blocked-recovery), [ADR 0015](adr/0015-provisional-cross-player-continuation-resolution.md) and `reserved-resources.ts` in [cards: helpers](architecture/cards.md#helpers-under-sharedcardshelpers).
- **Standard leaves.** Goods move through the standard leaves: `gain` for new goods, `collect` for goods on an Action Space, `take-from-card` and `receive` for goods on a card, `exchange` for conversions, `pay` for costs. Other cards' reactions subscribe to these leaves and the statistics read them, so both see the movement (`CWM055_WoodWorker`, `CWM066_Brazier`). A reaction to getting goods subscribes to every leaf that can credit them (§4.1). See [actions: effects and internal actions](architecture/actions.md#effects-and-internal-actions).
- **Action parameters.** `params` and `actionContext` keys are copied from the action's effect file or from a card that uses it, because an unknown key is ignored without an error: `shared/actions/effects/construct.ts` limits rooms with `maxRooms`, `shared/actions/effects/stables.ts` limits stables with `max` (`C149_ResourceRecycler`, `CWM037_MasterStableman`). The Session test submits one more than the limit and expects a rejection.
- **Optionality.** Printed "may", "can" and "up to" give the player the choice: the node is `optional`, or its menu carries a stop option (`CWM069_ChangingPlans`, `CWM045_StableDeliveryman`). A non-optional leaf returned from a hook runs without asking. See [engine: node types](architecture/engine.md#node-types) and §4.4.
- **Scope.** The card reads the lifetime it prints. "This action" is the handler's `actionEvents` / `eventQuery`; "this turn" is the Turn Scope, through `helpers/turn-token.ts` (`A074_StableTree`); "this round" is `state.round`. `state.events` is the committed log of the whole game: events of the action still running may be missing from it, and a balance that depends on order is folded in order (`CWM056_Almshouse`). See [session: Turn Scope](architecture/session.md#turn-scope-and-action-execution-scope) and [hooks: events](architecture/hooks.md#hook-system).
- **Identity.** The card remembers a farm thing by its coordinates, a tile or a fence segment. `pasture.id` is positional and renumbered when fences change, and array indexes shift (`CWM074_Donkey`). Reading its marker, the card confirms the marked thing still stands (`CWM005_BeeKeeper`). See the Farmyard paragraph of [domain](architecture/domain.md).
- **Edition.** The card stays correct when classic and revised cards share one game, and declares its own edition difference; no rule reads the game's Card Edition ([ADR 0050](adr/0050-rules-code-does-not-assume-one-card-edition.md)).
- **Supply limits.** Fence and stable limits come from the supply-token helpers and the payment pipeline, such as `getAvailableStableSupplyCount()`. See the supply-token paragraph of [payment](architecture/payment.md).
- **Card text.** `meta.desc` writes goods, animals, terrain and points as icon tokens (`<FOOD>`, `bonus <SCORE>`) and exact action, space and card names as `__Name__`. See [cards: Card Source](architecture/cards.md#card-source-and-projections). Gate: `scripts/__tests__/card-description-icons.test.ts` and `card-description-double-underscore.test.ts`.
- **Evidence.** The card has a positive test, where the effect fires, and a negative test, where it must stay silent (§5, [CARD_TEST_TEMPLATE](CARD_TEST_TEMPLATE.md)).

## 1. Decide feasibility first

A card is **feasible** when it fits in one closed card file:

- it uses only the mechanisms in §4, the helpers in `shared/cards/helpers/`, and Card Definition fields;
- persistent counters and markers live in `player.cardStates[cardId]`, written by returned leaves;
- later choices use the existing optional nodes, trigger-select and continuations;
- it changes no core path, such as `shared/actions/effects/pay.ts`, `shared/actions/effects/improvement.ts`, `shared/session/session-core.ts` or `server/game/authoritative-session.ts`, and adds no hook point, phase, action or engine node.

The card **needs a platform change** when it needs any of those core changes, or a mechanism that neither §4, the module documents nor any existing card provides. Report the missing seam with evidence: the files and symbols you checked, the closest existing card, and what it cannot express.

The card **needs more information** when the printed text leaves the timing, the choosing player or an edge case open, and the rules in §3 do not settle it. Ask one precise question.

In the Workshop, record this verdict with `report_feasibility` before writing artifacts; a `needs-platform` verdict lets the author prefill a GitHub issue with your evidence and gaps.

Absence of evidence is not evidence of absence. Before declaring a gap, search the card text pattern in §4, the hook list in `shared/cards/card-effects.ts`, the subscription contract in `shared/cards/listener-contract.ts`, and a similar existing card.

## 2. Card Source shape

A native card is one module, `shared/cards/<Deck>/<Id>_<Name>.ts` (community cards: `shared/cards/community/<CARD_ID>.ts`). It exports `defineMinorCard({ meta, impl })` or `defineOccupationCard({ meta, impl })` from `shared/cards/card-source.ts`. `impl` holds `listeners`, `effect`, `modifiers`, `prerequisiteCheck`, `getBaseCosts` and `reaches`, typed in `shared/cards/registry.ts`. `reaches` lists other card IDs the source may name.

**Workshop source** is this same module (ADR 0052), written as the file its pull request adds. The author's browser Worker resolves its `shared/` imports to its own engine modules, and the server checks only its structure without running it (`shared/custom-code/card-source-admission.ts`): one export named after the card, relative imports of shared engine modules and card helpers (not other cards or tests), and an inline literal `meta` with `deck: 'community'`. The retired `CARD_DEF` / `CARD_IMPL` sandbox format no longer runs; a draft still in it must be regenerated as a module ([CUSTOM_CARD_SANDBOX](CUSTOM_CARD_SANDBOX.md)).

## 3. Choose the timing

Card text, official rulings and recorded project interpretations decide the timing. Reference implementations do not ([ADR 0033](adr/0033-card-listener-timing-follows-project-semantics.md), [ADR 0031](adr/0031-explicit-action-space-use-subscriptions.md)). "Each time" alone selects no phase: the trigger and its dependence on the result do.

First check whether the text describes a reaction at all. These "each time" texts use another mechanism and need no listener phase:

| Card text | Mechanism | Examples |
|---|---|---|
| "instead", or declining an action to get something else | a `computeReplace` listener returning `decline` with an `alternativeFlow`, decided before the action runs | `A097_Freshman`, `B026_AgrarianFences`, `B103_FieldMerchant`, `D138_PetLover` |
| A discount, "do not have to pay", "replace X with Y" in a cost | a cost modifier or `computeCosts` (§4.14) | `A014_CarpentersHammer`, `A088_HedgeKeeper`, `B095_MasterBricklayer`, `E060_WorkingGloves` |
| A point of the round or harvest: goods placed in preparation, a space revealed, people returning, harvesting, newborn animals | a stage hook on `impl.effect` (§4.3) | `A049_NestSite`, `C021_HeartofStone`, `C097_SeedResearcher`, `A106_SlurrySpreader`, `E133_ChampionBreeder` |
| A state rather than an event, such as "both … are occupied" | an availability condition on a card action space or an anytime ability (§4.9) | `A162_ForestTallyman`, `D178_SubstituteTeacher`, `E014_WoodSaw` |

Otherwise choose the subscription from the trigger:

| Card text | Subscription |
|---|---|
| "Each time you use action space X" | `actionSpaces: ['x']`, or `'all'` with a category helper |
| "Each time you place a person" (not a move) | `actions: ['place-farmer']` with `requiresNewPlacement: true` |
| "Each time you take the X action" (plow, sow, bake, build …) | `actions: ['x']` |
| "Each time you get goods from an action space" | an acquisition: `actions: ['collect', 'gain']`, `phases: ['after']`, filtered by `hasActionSpaceAcquisition` |

Then choose the phase. These are the defaults from ADR 0033:

| Card text | Subscription | Phase |
|---|---|---|
| Printed "immediately before" or "before" | as printed | `before` |
| Printed "immediately after" | as printed | `immediatelyAfter` |
| Printed "each time after" or "after" | as printed | `after` |
| An extra benefit for using a space (also get, can buy, can exchange) that does not depend on that use's result | `actionSpaces` | `before` |
| Taking at least N goods from an accumulation space | `collect`, an acquisition | `after` |
| A rule action performed by the owner, another player or any player: plowing, building, renovating, fencing, sowing, family growth or exchanging for food | that rule action, with the matching `scope` | `after` |
| An extra benefit for taking a Moor Special Action | `moor-action` | `before` |

- A `before` reward is usable within the same action, so it can pay for or feed into that use.
- Without printed timing, use `immediatelyAfter` only when the effect depends on this use's result and must settle before ordinary `after` reactions.
- Several sources in one window are ordered by the player, and each choice re-reads current state. Add no fixed order and no `during` phase.
- A `before` reward never makes an empty accumulation space enterable, and a card adds no `isDoable` override to force that.

Listener defaults:

- `scope: 'player'` (also `'opponent'` and `'any'`);
- `zones: ['played']`, and a hand listener needs `zones: ['hand']`;
- always set `cardIds: [CARD_ID]`.

A registration has exactly one selector: `actions`, `actionSpaces`, `events` or `globalQuery` (`shared/cards/listener-contract.ts`).

Handlers are pure. Every mutation, including writes to the card's own `cardStates`, is a returned leaf such as `gain`, `pay` or `special-effect`, and a guard fails tests on writes. Stage hooks and `onBuy` are not listeners: they run on live state, and some cards write there directly (`E140_Carter`).

Action-space IDs are defined one per file under `shared/cards/action/` (for example `round-western-quarry.ts` has `id: 'western-quarry'`). Category helpers are in `shared/cards/helpers/action-space-categories.ts`. Handlers compare `context.space?.id`.

## 4. Card text patterns

Leaf helpers live in `shared/cards/helpers/pay-gain-node.ts`:

- `gainLeaf(cardId, gain)` drops `score`;
- `bonusVpLeaf(cardId, n)` grants bonus points;
- `payLeaf` pays a cost;
- `payGainActionFlow` is a mandatory pay-then-gain;
- `payGainFlow` / `payGainNode` are the optional pay-then-gain (it adds `bonus-vp` for `score`);
- `payThenActionFlow` pays, then runs an action.

### 4.1 "Each time you use space X, you also get …"

```ts
{ id: 'my-card-fishing', cardIds: [CARD_ID], actionSpaces: ['fishing'], phases: ['before'],
  handler: ctx => ({ flow: gainLeaf(CARD_ID, { wood: 1 }), sourceCard: CARD_ID }) }
```

- Examples: `A042_ForestLakeHut` (`before`, with `'all'` and a space check) and `C051_FishingNet` (explicit `actionSpaces`).
- "After you use" uses `phases: ['after']` (`D101_SugarBaker`).
- "Each time you get food from an action space" is an acquisition: `E118_KindlingGatherer`, with `hasActionSpaceAcquisition` in `helpers/event-provenance.ts`.
- "Adjacent to space X" on the printed classic board uses `getClassicAdjacentSpaceIds` in `helpers/classic-board-topology.ts`, independent of the UI layout (`CWM080_FishHook`, `CWM025_Godfather`).
- Test: `A42_ForestLakeHut-session.test.ts`; empty-space admission in `empty-accumulation-admission-session.test.ts`.

### 4.2 When played, and Card Definition fields

`effect.onBuy(state, player, paymentInfo?, ctx?)` runs after payment and the card commit, before trailing reactions. The just-played card does not match its own `occupation` / `improvement` reactions. Examples are `A016_RammedClay` and `C143_StoneBuyer`, which offers an optional purchase. Its test, `E140_Carter-session.test.ts`, plays the card from hand through `lessons`.

| `meta` field | Effect |
|---|---|
| `cost` / `altCosts` | Cost or alternative costs (`shared/contract/cards.ts`) |
| `vp` | Printed points |
| `extraVp` | Display flag only; bonus points come from `computeBonusScore` or `bonus-vp` |
| `prerequisite` | Printed text parsed into checks. An unrecognized clause passes, so use `occupationPrerequisites` / `improvementPrerequisites` (`{ min, max }`), `maxRound` or `impl.prerequisiteCheck` for anything else |
| `players` | Deal-pool filter such as `'3+'` |
| `category` | Display only |
| `exchanges` | Declarative conversions (§4.9) |

### 4.3 At a stage of the round or harvest

Declare `impl.effect.<hook>: (state, player, ctx?) => ActionFlow | void`. The hook names and their order are listed in `shared/cards/card-effects.ts` and in [hooks](architecture/hooks.md#stage-hooks).

| Dispatch | Hooks |
|---|---|
| Stage Dispatch: one trigger-select per player, sources frozen at window entry | `onBeforeStartOfTurn`, `onAfterRevealAction`, `onPreparation`, `onRoundStart`, `onEndPreparation`, `onBeforeWork`, `onWorkStart`, `onAllWorkersPlaced`, `onEndTurn`, `onBeforeHarvest`, `onStartHarvest`, `onStartHarvestFieldPhase`, `onHarvestFieldPhase`, `onEndHarvestFieldPhase`, `onBeforeEndGame` |
| Serial per player, then improvements, minors and occupations | `onRoundEnd`, `onAfterRoundEnd`, `onBeforeReturnHome`, `onStartReturnHome`, `onReturnHome`, `onAfterReap`, `onHarvest`, `onStartHarvestFeedingPhase`, `onHarvestFeedingPhase`, `onEndHarvestFeedingPhase`, `onEndHarvest`, `onAfterHarvest` |

- Preparation windows filter sources with the pure `effect.stageEligibility[hook]` (`E111_Recluse`).
- `handHooks` lets a hand card fire, except for `onBuy`, `onEndTurn` and `onBeforeEndGame`.
- A harvest-start example is `E110_Dentist` (`onStartHarvest`).
- With the seat setting on (the default), a mandatory effect that only gains non-animal goods, stores goods on a card or updates counters resolves before the player orders the rest ([ADR 0055](adr/0055-same-timing-sources-resolve-by-a-seat-setting.md)); do not rely on play-zone order. Keep per-harvest bookkeeping in round-keyed card state (`C062_CookeryExtension`) and random draws in an action leaf (`M104_WildHarvest`), never in the stage hook itself.
- Test: `E090_E127-parity-session.test.ts` reaches the round-4 harvest (§5).

### 4.4 "You may pay X to get Y"

Return `payGainNode({ cardId, cost, gain })` or `payGainFlow(...)`, an optional `seq` of `pay` then `gain`. The player sees the option plus `__skip__`.

- When the first step cannot start, the engine skips the optional root, so an affordability guard is optional.
- Return `undefined` when the printed condition fails.
- A card-level `seq[pay, gain]` is the approved shape; the "forbidden shapes" in [hooks](architecture/hooks.md#pay-child-invariants) are about a host action's own `pay` child.
- Examples: `D101_SugarBaker` (with `followUp`) and `E110_Dentist`.
- Test: `D101_SugarBaker-session.test.ts`, with `resolveNonSkipChoice` / `resolveSkipChoice` from `_helpers/trigger-select.ts`.

### 4.5 Reacting to another player

`scope: 'opponent'` or `'any'`. In the handler context, `player` is the acting player and `ownerPlayer` is the card owner. The owner always chooses, and Pass is the owner's.

| Subscription | Untargeted returned flow runs as |
|---|---|
| `actionSpaces` or `place-farmer`, `before` | the actor |
| Rule `actions` `before`; every `immediatelyAfter` / `after` | the owner |

Ways to target a player:

- `targetPlayerId` on a flow node re-owns the whole subtree (actor, payer and chooser). This is the phase-independent form; see `D149_CasualWorker` and `E160_KelpGatherer`.
- `gain` params: `recipientPlayerId` sets the recipient, `payerId` transfers from that player, `recipientMode: 'others'` gives to every other player (`B138_ForestGuardian`, `C051_FishingNet`).
- `actionContext.targetPlayerId` on a leaf works only for `special-effect` and `bonus-vp`.

Tests: `E160_KelpGatherer-session.test.ts` (with `confirmPlayerSwitch`) and `A132_Publican-session.test.ts`.

### 4.6 Persistent modifiers

| Card text | Mechanism | Example |
|---|---|---|
| Pastures hold more animals | `effect.computePastureCapacityModifiers` returning `{ sourceCard, kind: 'additive', apply }` | `A012_DrinkingTrough` |
| Anything costs less, more or something else | the payment pipeline (§4.14) | `A088_HedgeKeeper`, `A143_Stonecutter` |
| Harvest yields more | `registerHarvestCountModifier`; it does not filter ownership, so check the card is played | `E073_Scythe` |
| Feeding costs less | `registerHarvestFeedingRequirementModifier` (played-only) | `E159_OldMiser` |
| Breeding threshold | `effect.computeBreedThreshold`; the smallest wins | `E084_DollysMother` |
| Extra room capacity | `effect.computeExtraRoomCapacity` | `B010_Caravan` |

### 4.7 Once per turn, round or harvest

- **Once per Turn:** `isUsedThisTurn` / `markUsedThisTurnLeaf` from `helpers/turn-token.ts` (`A074_StableTree`).
- **Once per round:** there is no helper. Return a `set-flag` `special-effect` leaf, check `isCardFlagged` in the handler, and reset it from `onRoundStart` (`D122_ClayCarrier`, `C143_StoneBuyer`). Other `special-effect` kinds are `set-extra-data`, `increment-extra-data`, `set-counter` and `increment-counter`.
- **Once per harvest exchange:** `createSingleHarvestExchange` in `helpers/stage-effects.ts` (`B101_FurnitureCarpenter`).
- Test: `D122_ClayCarrier-session.test.ts`.

### 4.8 End-game points

- `effect.computeBonusScore(state, player, { categories })` returns a number (`A098_StableArchitect`).
- Points earned during play use `bonus-vp` leaves.
- In tests, assert the `cardBonusVp` category of `resp.scores`.

### 4.9 Anytime abilities and conversions

- **Static conversion:** `meta.exchanges: [{ from, to, max?, sourceId, triggers: ['anytime' | 'harvest' | 'bake-bread'] }]` (`C109_SchnappsDistiller`).
- **Conditional recipe:** `actions: ['compute-exchanges'], phases: ['computeExchanges']` returning `{ extraExchanges }` (`B101_FurnitureCarpenter`).
- **Free-form anytime flow:** `actions: ['anytime'], phases: ['anytime']`. The listener `id` is the anytime action ID passed to `takeAnytimeAction` (`D122_ClayCarrier`).
- **Before scoring:** `preScoring: true | 'only'`.

### 4.10 Future goods and offers

- Goods on future round spaces: `futureMeeplesNode` (`A046_ClawKnife`).
- A one-time future purchase: `scheduleOffersNode` in `onBuy`, with `scheduledOffersRoundStartFlow` on `onRoundStart` (`D069_SmallGreenhouse`).
- A single-round formula: `effect.timedRules` (`C155_FoodDistributor`).

### 4.11 Taking part of an accumulation space

- `createPartialTakeFromSpaceLeaf({ sourceCard, spaceId, resource, amount })` in `helpers/partial-take.ts` (`B081_Handcart`, `E005_NightLoot`).
- `collect` fails when fewer than `amount` remain.
- No test covers an opponent's `before` reaction emptying the space the actor is about to collect; if a card needs that, test it and report a gap when it blocks.

### 4.12 Goods, animals or crops on the card

- **Goods:** a `store-on-card` leaf, read back with `getStoredResource` and `take-from-card` (`E052_Cubbyhole`). "Take its goods at any time" is `cardResourceWithdrawal` in `helpers/card-resource-withdrawal.ts` (`CWM096_OakCask`).
- **Goods on the farmyard:** a token on an unused space is `farmTokenSelection` in `helpers/farm-token-selection.ts` (`CWM064_Bonre`); one marker per room is `roomFoodMarkers` in `helpers/room-food-markers.ts` (`CWM071_Cookies`).
- **Animals:** `meta.animalHolder: true` with `effect.onComputeAnimalZones` adding a `card:<id>` zone (`B012_Stockyard`).
- **Crops:** a Card Field (`B068_Beanfield`; [cards](architecture/cards.md#card-fields-and-the-logical-field-seam)).

### 4.13 People left to place and "place another person"

- **People left, last person, all people placed:** read `peopleLeftToPlace()` from `actions/guest-turns.ts`, never `workersAvailable()` alone: a pending Guest is a person left to place (`E131_MarketMaster`, `M057_Taps`).
- **"Place another person":** gate on `peopleLeftToPlace() > 0` and return a `place-farmer` leaf with the card as `sourceCard`, or `spend-worker` for a person on the card. The placement itself offers a family member or a pending Guest (`C042_RavenousHunger`, `D103_CanalBoatman`). Constraints computed with `computeAllowedPlacementSpaces` pass `ignoreWorkerAvailability` when no family member is left.
- Test: `guest-mixed-edition-session.test.ts`.

### 4.14 Costs and payment

Every cost runs through one payment pipeline ([payment](architecture/payment.md)). A card changes a cost by declaring a modifier or answering `computeCosts`; the pipeline then enumerates the payments, so the card never subtracts resources itself. `appliesTo` and `costType` take `construct`, `renovation`, `fencing`, `stables`, `plow`, `occupation`, `major-improvement` or `minor-improvement`.

| Card text | Mechanism | Example |
|---|---|---|
| "Pay X instead of Y", "N of them are free" when building, renovating, fencing, building stables or plowing | `impl.modifiers` with `type: 'trade'`, `appliesTo`, `from`, `to` and `max`; `scope: 'unit'` applies per room, fence or stable, `'action'` once per action | `A088_HedgeKeeper`, `A016_RammedClay`, `CWM011_Contractor` |
| "You no longer need X" | `impl.modifiers` with `type: 'remove-resource'` | `C014_StrawThatchedRoof` |
| A room price that depends on the house, or a discount per room | `actions: ['construct'], phases: ['computeCosts']` returning `trades` built by `helpers/construct-cost.ts` (`constructUnitPriceTrade`, `constructUnitDiscountTrade`, `constructedRoomMaterial`) | `B126_Carpenter`, `CWM027_Heiress` |
| A renovation discount | `actions: ['renovate-house'], phases: ['computeCosts']` returning `bonuses` built by `helpers/renovation-cost.ts` (`sourcedMandatoryBonus`, `sourcedMandatoryBonusChoices`, `selectedRenovationTarget`) | `D081_RoofLadder`, `B128_Plumber` |
| A flat discount or surcharge on fencing, plowing or another action | `computeCosts` returning a `costs` delta together with `costAttribution` for the same amount; a static gate rejects `costs` without it | `C016_FieldFences`, `C037_DwellingMound` |
| Improvements or occupations cost less, or cost something else | `actions: ['improvement']` or `['occupation']`, `phases: ['computeCosts']` with `deriveCardCostCandidate`, built with `PaymentSolver.discountCardCostCandidate` | `A143_Stonecutter`, `E060_WorkingGloves` |
| The card's own cost depends on the game state | `impl.getBaseCosts` | `B036_Bottles` |
| A printed choice between costs | `meta.altCosts` | `A004_Baseboards` |
| "You can use goods from … to pay" | goods on an Action Space: `computeCosts` returning `paymentResourceProviders`; goods on the card: a `bonuses` choice with `choiceAffectsState` plus an `after` listener on `pay` that removes what was used | `B155_ArtTeacher`, `E123_ResourceHoarder` |
| "Each time you pay …", "each time another player pays …" | `actions: ['pay'], phases: ['after']`; the context's `costType` names the purpose, and `sumActualPaidResource` / `sumResourcePaid` in `helpers/event-provenance.ts` read the amounts | `E122_Cottar`, `D171_SeniorTeacher` |
| Points for goods held at scoring, where each good counts for one card only | `effect.computeCostedBonus` returning `{ cost, score }` levels | `Major_Pottery`, `CWM086_GlassblowersShop` |

Tests: `A123_FrameBuilder-construct-session.test.ts`, `E60_WorkingGloves-session.test.ts`, `workshop-timing-payment-session.test.ts`.

### 4.15 Granting an action

A card grants a rule action by returning that action's leaf: `plow`, `sow`, `construct`, `stables`, `fence`, `renovate-house`, `family-growth`, `bake-bread`, `improvement` or `occupation`. The leaf runs that action only; it does not use the Action Space that normally offers it ([actions: effects and internal actions](architecture/actions.md#effects-and-internal-actions)).

- **Price:** `exactCost: {}` makes it free and `exactCost: { food: 1 }` fixes the price. Farm actions read it from `actionContext` (`C149_ResourceRecycler`, `A001_Shelter`); `occupation` reads it from `params` (`C028_TeachersDesk`).
- **Limits:** `maxRooms` for `construct`, `max` for `stables`, `types` and `params.allowedPurchases` for `improvement` (`A027_OvenSite`), `fencePolicy` for `fence` (`B002_MiniPasture`; [actions: fence policy](architecture/actions.md#fence-segments-and-policy)), `skipRoomCheck` for `family-growth` without room (`B127_Seducer`).
- **Counting as the action:** `actionContext.trueAction: false` says the effect does not count as taking the named action, so "each time you take the X action" reactions stay silent. Leave it out when the card text grants the named action itself ([session: Turn Scope](architecture/session.md#turn-scope-and-action-execution-scope)).
- **A person on a space:** `place-farmer-on-space` places another person on a fixed space (`CWM061_BackDoor`); `jumpLeaf` in `helpers/jump-leaf.ts` moves a placed person (`A129_Swagman`); `recall-placed-worker` takes one back (`D094_HenpeckedHusband`).

### 4.16 Choices and farm selections

- **One of several effects:** an `xor` flow; give each child a `choiceLabelKey` so the options read differently (`B026_AgrarianFences`).
- **A menu of values:** an `emit-choice` leaf with `params.options: [{ value, labelKey, labelParams }]`; `requiresExplicitChoice: true` asks even when one option remains. The answer arrives in `effect.resolveChoice(state, player, choice)`, which may return the next flow, including another `emit-choice` (`B003_Moonshine`, `CWM114_WineCloset`, `CWM045_StableDeliveryman`).
- **Farmyard tiles:** a `selection` leaf with `actionContext: { selectionKind: 'farm-position', selectionEffect, minSelections, maxSelections, selectableTiles }`, and `registerSelectionEffect` / `registerSelectionValidator` from `shared/actions/helpers/selection-effect-registry.ts` for what the pick does and which picks are legal (`A070_LiftingMachine`, `CWM103_Raspberries`). Tests answer with `commitSelectionChoice(i, { positions: ['row-col'] })`.

### 4.17 Making an action possible or forbidden

| Card text | Mechanism | Example |
|---|---|---|
| "You can no longer use …" | `phases: ['isDoable']` with `globalQuery: true`, returning `{ doable: false }` when `context.actionId` names the space | `D050_ForeignAid`, `CWM020_FarmSchoolGraduate` |
| "You can take action X even without …" | `phases: ['isDoable']` on that action, returning `{ doable: true }` only when `context.doable` is false and the card supplies what is missing | `A065_SeedPellets`, `D014_HammerCrusher` |
| "You can use an occupied space", other extra placement targets | `actions: ['place-farmer'], phases: ['computeArgs']` returning `extraOptions` whose value starts with `OCCUPIED_SPACE_CHOICE_PREFIX`. An accumulation space its occupant emptied stays closed to `isDoable`; a different reward there is a `computeReplace` on that space, which tells the arriving person by `actionSpaceUse.personUse` | `A025_Bassinet`, `CWM016_Diplomat`, `CWM013_Cowboy` |
| "You can also buy … there" | `phases: ['computeChoiceCandidates']` on `improvement`, returning `extraOptions` | `C027_Blueprint` |

### 4.18 Reading what happened

| The card needs | Read | Example |
|---|---|---|
| Rooms or stables this action built | `helpers/construction-events.ts` (`getRoomsBuiltThisAction`, `getActionRoomConstructions`, `getActionStableConstructions`) | `A093_BedMaker`, `CWM060_Attic` |
| Fences this action built, tiles newly fenced | `helpers/fence-events.ts` (`hasOrdinaryFenceBuiltEvent`, `countNewFenceEdges`, `getActionNewlyEnclosedPastureTiles`) | `CWM026_HedgeMaster` |
| Farmyard spaces that became used | `events: ['farm.spacesUsed']` with `getActionNewlyUsedTiles` in `helpers/farmyard-events.ts` | `A040_PottersYard`, `CWM103_Raspberries` |
| What was built earlier in this Turn | `helpers/action-snapshot.ts` | `A074_StableTree` |
| Which person of the round uses the space | `getSpaceUsePersonPlacementOrdinal` and the other queries in `helpers/round-placement.ts` | `A163_BuildingExpert` |
| Cards a player has in play, by type or capability | `helpers/card-type.ts` (`collectCardsAs`, `playerHasCardCapability`); counts frozen at the trigger use `helpers/trigger-snapshot.ts` | `B133_VillagePeasant`, `B049_Scales` |
| Whether a space is a Lessons space | `isLessonsSpaceId` in `helpers/lessons-spaces.ts` | `D171_SeniorTeacher` |
| The card's own counters, flags and data | `helpers/card-state.ts` (`readCardExtraData`, `isCardFlagged`) | `D122_ClayCarrier` |
| Used and unused farmyard spaces | `getUsedFarmyardTileKeys` in `shared/domain/farmyard-usage.ts`; a card never counts the grid by hand | `B038_FutureBuildingSite`, `CWM103_Raspberries` |
| Whether the player can house their animals | `canAccommodateAllAnimals` and `computeAnimalZones` in `shared/domain/animal-zones.ts` | `D036_BreedRegistry` |
| Events of this action or of the whole transaction, and who triggered the reaction | `context.actionEvents`, `context.transactionEvents`, `context.eventQuery`; `context.triggerPlayer ?? context.player` | `D171_SeniorTeacher`, `A132_Publican` |

### 4.19 Less common seams

| The card needs | Seam | Example |
|---|---|---|
| An extra turn or person this round | `effect.contributeExtraTurn`, with `extraTurnBeforeWorkers` when it comes before the player's own people; `timedRules` for one scheduled in a later round | `E093_Motivator`, `A022_Telegram` |
| A Guest | `grantGuestLeaf` / `grantImmediateGuestLeaf` in `helpers/guest-flow.ts` | `CZ314_Keg`, `CI073_Guest` |
| Points that several players can earn | `effect.computeSharedPostScore` returning `{ playerId, score }` entries | `A135_AnimalReeve`, `CWM087_GoldMedal` |
| A limit on which animals a card zone keeps | `effect.getInvalidAnimals` | `B011_Feedyard` |
| Sowing on other tiles, or a different amount | `effect.onComputeSowableFields` with `onSowExtraField`; `effect.modifySowAmount` | `B072_LoveforAgriculture`, `E071_CowPatty` |
| Goods the player may want to keep until the harvest | `effect.preHarvestGoodsWanted` | `A061_WinnowingFan` |
| A read-only fact that shared rules add up, such as reserved pieces or a score adjustment | `effect.getRuleContributions` | `E159_OldMiser`, `CWM021_FenceDealer` |
| Rewriting a request the card's own action raised | `effect.projectInteractionRequest` | `C127_Lover` |
| A stack of goods on the card | `push-to-card-stack` / `pop-card-stack` leaves with `presentation: { stack: true }` | `CWM022_FoodConnoisseur` |
| Putting goods back on an Action Space | `returnToSpaceThenGainFlow` in `helpers/pay-gain-node.ts` | `A164_WoodWorker` |
| Returning a built stable | `helpers/stable-removal.ts` | `CWM069_ChangingPlans` |
| Rehousing animals after the card changes where they may live | a `reorganize` leaf | `CWM074_Donkey`, `E083_ShepherdsWhistle` |
| A cooking improvement | `meta.isCookery: true` with `exchanges` | `A060_OrientalFireplace` |
| Public markers on the card or the farm | `presentation`, or `effect.getStatePresentation` for computed markers | `CWM050_TapestryWeaver` |
| Text shown on the card | a `set-infobox` `special-effect` leaf | `A173_ClayThief` |
| A state change of the card's own that no standard leaf expresses | a card-private action: `registerAdHocAction` in `shared/actions/helpers/ad-hoc-action-registry.ts`, with an id that starts with `card_`; goods still move through the standard leaves ([actions: effects and internal actions](architecture/actions.md#effects-and-internal-actions)) | `A040_PottersYard`, `E073_Scythe` |

## 5. Session tests

Every card test covers at least one **positive** scenario, where the effect fires and changes state, and one **negative** scenario, where it must not fire: the card is not in play, another player triggers it, the player declines, or the cost cannot be paid. [CARD_TEST_TEMPLATE](CARD_TEST_TEMPLATE.md) lists what to record and assert. Workshop browser tests name each case `positive: …` or `negative: …`; a run passes only with at least one passing test of each kind.

**Repository Session tests** (`server/__tests__/*-session.test.ts`):

- Build with `createWorkSession({ seed, options: { playerCount: 2 }, configure })` from `_helpers/session-fixtures.ts`. In `configure`, set `occupationPlayed` / `minorPlayed` or the hands, resources, `cardStates` and `round`. Irrelevant hands are `['__test_placeholder__']`.
- To reach the round-4 harvest, set `state.round = 4`, give food, call `markAllWorkersUsed` for every player, then call `autoAdvanceRoundEnd(session, { onChoice })` (`_helpers/round-end.ts`) or `performRoundEnd()`. `enterFeeding` stops at feeding.
- To answer prompts, call `resolveChoice(i, value)`. `'__skip__'` declines an optional node and `'__pass__'` passes a trigger-select. `confirmPlayerSwitch` submits as `request.fromPlayerIndex`. Farm selections use `commitSelectionChoice`.
- Assert `ok` / `error`, players' `resources` and `cardStates`, `interaction.stateId` / `request.kind` / `playerIndex`, `resource.moved` events with `sourceCardId`, `log` and `scores`.

**Workshop browser tests** run in `client/local-sandbox/card-test-runtime.ts`:

- The runtime injects `test(name, fn)`, Chai `expect`, `createSession()` and `helpers` (`emptyResources`, `setActiveWorkerCount`, `setWorkersAtHome`). Imports are rejected.
- `createSession()` returns a two-player `GameCore` at round 1, work phase, idle, seed 42, with placeholder hands.
- Put the card in play with `session.devPlayCard(0, CARD_ID)`. Adjust state with `getState()` and `loadState(state)`.
- A failed command's error is appended to the failing test's message. Examples: `client/local-sandbox/__tests__/card-test-runtime.test.ts`.
