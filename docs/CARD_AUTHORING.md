# Card Authoring Guide

Use this guide to implement one card: map its printed text to an existing mechanism, copy the closest example card, and copy that card's Session test. Repository agents and the Workshop model both read it. Each section names example cards and tests; read them for the exact field names. The [architecture index](ARCHITECTURE.md) and its module documents explain the mechanisms. This guide only points from card text to them.

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
| A discount, "do not have to pay", "replace X with Y" in a cost | a cost modifier or `computeCosts` (§4.6) | `A014_CarpentersHammer`, `A088_HedgeKeeper`, `B095_MasterBricklayer`, `E060_WorkingGloves` |
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
| Stage Dispatch: one trigger-select per player, sources frozen at window entry | `onBeforeStartOfTurn`, `onAfterRevealAction`, `onPreparation`, `onRoundStart`, `onEndPreparation`, `onBeforeWork`, `onWorkStart`, `onAllWorkersPlaced`, `onEndTurn`, `onBeforeHarvest`, `onStartHarvestFieldPhase`, `onHarvestFieldPhase`, `onEndHarvestFieldPhase`, `onBeforeEndGame` |
| Serial per player, then improvements, minors and occupations | `onRoundEnd`, `onAfterRoundEnd`, `onBeforeReturnHome`, `onStartReturnHome`, `onReturnHome`, `onStartHarvest`, `onAfterReap`, `onHarvest`, `onStartHarvestFeedingPhase`, `onHarvestFeedingPhase`, `onEndHarvestFeedingPhase`, `onEndHarvest`, `onAfterHarvest` |

- Preparation windows filter sources with the pure `effect.stageEligibility[hook]` (`E111_Recluse`).
- `handHooks` lets a hand card fire, except for `onBuy`, `onEndTurn` and `onBeforeEndGame`.
- A harvest-start example is `E110_Dentist` (`onStartHarvest`).
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
| Rooms, renovation, fences, stables or plowing cost less | `impl.modifiers` (trade, bonus or cost-removal modifier with `appliesTo`) | `A016_RammedClay`, `A088_HedgeKeeper`, `A143_Stonecutter` |
| Improvements cost less | `actions: ['improvement'], phases: ['computeCosts']` with `deriveCardCostCandidate` | `A143_Stonecutter` |
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

- **Goods:** a `store-on-card` leaf, read back with `getStoredResource` and `take-from-card` (`E052_Cubbyhole`).
- **Animals:** `meta.animalHolder: true` with `effect.onComputeAnimalZones` adding a `card:<id>` zone (`B012_Stockyard`).
- **Crops:** a Card Field (`B068_Beanfield`; [cards](architecture/cards.md#card-fields-and-the-logical-field-seam)).

### 4.13 People left to place and "place another person"

- **People left, last person, all people placed:** read `peopleLeftToPlace()` from `actions/guest-turns.ts`, never `workersAvailable()` alone: a pending Guest is a person left to place (`E131_MarketMaster`, `M057_Taps`).
- **"Place another person":** gate on `peopleLeftToPlace() > 0` and return a `place-farmer` leaf with the card as `sourceCard`, or `spend-worker` for a person on the card. The placement itself offers a family member or a pending Guest (`C042_RavenousHunger`, `D103_CanalBoatman`). Constraints computed with `computeAllowedPlacementSpaces` pass `ignoreWorkerAvailability` when no family member is left.
- Test: `guest-mixed-edition-session.test.ts`.

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
