# `shared/domain/`: Domain aggregation

[English](domain.md) | [中文](domain_zh.md)

Derived views and invariant checks live here. `PlayerState` stays plain JSON. Player-board and farm queries ("can I plow, sow or build here?") go through `PlayerBoard`; other domain predicates live with their aggregate, such as `canAccommodateAnimalTotals()` in `animal-zones.ts`, `canAddScoringReserve()` in `scoring-reserve.ts` and `canSpaceAcceptWorker()` in `space.ts`. Domain code is shared by the main client, sandbox and server.

```text
shared/domain/
├── player-board.ts          PlayerBoard and the playerBoard factory
├── farmyard.ts             farm-rule validation and normalizePlayerFarm
├── farmyard-interaction.ts interaction payload projections for farm-select and farm-position
├── farmyard-usage-core.ts  canonical used / unused farmyard spaces
├── pasture.ts              derived pasture sizes, stable counts and base capacity
├── animal-zones.ts         animal-zone capacity and accommodation
├── animal-reorg.ts         Animal Reorg Prefill
├── animal-payment.ts       animal payment order
├── animals.ts              animal model
├── scoring.ts              scoring and PlayerScoreSummary
├── scoring-reserve.ts      final Scoring Reserve reads, aggregation and scoring-clone deduction
├── farm.ts, field.ts, space.ts, farmyard-space-states.ts
└── index.ts
```

**PlayerBoard.** `PlayerBoard(player, state)` exposes `farmyard` (validation and queries such as `canPlow`, `canSow`, `canBuildFence`, `canBuildRoom`, `canBuildStable`), `farmInteraction` (derives `farm-select` / `farm-position` payloads) and `animals` (zone capacity and accommodation). A frontend farm draft consumes only the server payload.

**Farmyard.**

- `farm-operations.ts` commits room, stable, plow, fence, pasture, terrain, extension, space-state and crop proposals, including stable/fence removals to the authoritative player. Validators prepare projections; only the operation applies them. `FARM_LAYOUT_KEYS` defines the structural snapshot and write boundary. Space-state helpers and extension placement commit through this owner, including initial extension terrain in the same operation. Its detached `FarmOperationResult` captures successful positions and layout before/after, with newly used tiles restricted to coordinates that existed before the operation. The result belongs to the original action host. Each gameplay operation emits `farm.spacesUsed` for its newly used coordinates through that host's event sink; setup and recovery never dispatch reactions. A pasture conversion continuation can carry the original terrain change as `replacesTerrain`; the operation uses those replaced coordinates in its transient usage baseline, so continuous terrain-to-pasture use creates no false newly-used fact. Independent later operations use only their current geometry.
- Used / unused spaces are read only from `farmyard-usage-core.ts`, including extensions, terrain, blocked spaces and derived pasture tiles; `farmyard-usage.ts` and `farm.ts` are compatibility facades. Cards never hand-count a grid. Rooms, terrain, fields, stables and pasture tiles always count as used; a `farmyardSpaceStates` entry joins them only with `blocksPlacement`.
- Pastures persist identity, tiles and animal assignments. `getPastureSize()`, `getPastureStableCount()` and `getFencedStableCount()` derive the rest; `getPastureViews()` returns detached views; serialized `size` / `stables` are display-only and stripped on load.
- Farm and action-space provenance uses source / type metadata: `FenceSegment.type/source`, `WorkerRef.synthetic`, `ActionSpace.blockedBy`, supply-token helpers, action-space category helpers across player counts, reservation tokens and attachments. Base action definitions filter player counts 2–6; 5/6-only spaces are separate.
- Farmers of the Moor terrain ([ADR 0007](../adr/0007-farmers-of-the-moor-variant-runtime.md)) is the public top layer of `farmTerrain.kind`, with Covered Farm Terrain in `covered`. `planTerrainOperation()` validates the entire ordered selection without writing; any invalid coordinate, duplicate, layer, occupancy or adjacency rejects it before selection state changes. Both selection leaves and special actions commit the prepared operation through `farm-operations.ts`. `farm.terrainChanged` records before/after visible and covered layers and newly created fields; future terrain tokens reuse `futureMeeples` entries. Fenced terrain adjacency is a pure helper; one-off adjacency uses `adjacencyPolicy` / `allowedTiles` / `fencePolicy`. Only the visible and single covered layer are supported. See `server/__tests__/terrain-operation-session.test.ts` for atomic rejection, layer identity, nested receipts, restoration and undo.
- Farmyard Extensions extend the shared geometry; every farm reader uses the dynamic shape.

**Animals.**

- Each real room owns a capacity-one Room Animal Holder (`house:<positionKey>`); `PlayerState.houseAnimals` is the only writable room assignment ([ADR 0026](../adr/0026-each-room-is-an-animal-holder.md)). `roomAnimalZones` is a display projection stripped on load. Occupancy groups and `occupiedZoneLimit` (ordinary room holders share a limit of one) constrain occupied holders across rooms and card zones, through the pure `shared/contract/animal-zone-occupancy.ts` query.
- Loose stables store `{ animalType, animalCount }` per farm position ([ADR 0029](../adr/0029-loose-stables-retain-animal-species-and-count.md)); an empty stable has no entry and stays in `stableTiles`. Animal-number rules sum counts; occupied-space, presence and distinct-species rules keep their own semantics.
- Every "can accommodate" question uses `canAccommodateAnimalTotals()` or `canAccommodateAllAnimals()`, which search for a legal final assignment (allowing a later system `reorganize`) and respect `occupiedZoneLimit` and required-empty groups (`requiredEmptyZoneGroupIds`: at least one tagged zone per group stays empty). A card never tests a single zone locally. A candidate that permanently reduces holder capacity is filtered against post-payment capacity.
- `onComputeAnimalZones(player, zones, state)` adds zones; `computePastureCapacityModifiers(player, state)` returns replacement then additive modifiers in play order; `onComputeSharedAnimalZones()` contributes Hosted Card Animal Zones, stored in the card owner's `animalCountsByZone` but settled by `animalOwnerPlayerId` (and `breedingOwnerPlayerId` for breeding). Every holder writer persists `cardId`, `ownerPlayerId` and `animalOwnerPlayerId`; rewrites and cross-player deductions touch only the current Animal Owner's entries. `computeAnimalZones` fills a missing `cardId` on a card zone. A fixed animal type uses `allowedAnimalType`; `animalType` is only current occupancy.
- A farm-position-backed zone declares `farmPosition`, `countsFarmyardSpaceAsUnused` and `displaySource: 'farm-position'`; the client renders only server-provided zones there.
- `isHouseAnimalZone()` / `countHouseAnimals()` include tagged `houseAnimalZone` zones; `blocksHouseAnimalZones` removes them.
- Animal statistics and consumption (`getAssignedAnimalsByType()`, `subtractAnimalsFromBoard()`) read and write legacy holder fields together with `animalCountsByZone`. Payment order lives in `animal-payment.ts`: card-local `consumeAnimalPayment()`, then board and holders, then counter-backed holders marked `capacityCounterKey` / `capacityLossOnPayment`. A specific card counter named in `animalPaymentPreference.prefer` goes first and disables the counter-backed fallback. System removals notify cards through `onAnimalRemoved()`.
- Reorganization validates identity, species, counts, mixing, capacity, inventory, exclusive limits and required-empty groups before mutation; invalid input returns a recoverable `log.reorganizeFail` and changes nothing. Omitted zones are empty; under-assignment discards animals deliberately. Entering reorganization moves animals displaced from inactive or reduced card storage to reserve without reducing totals.
- Animal Reorg Prefill (`prefillAnimalZones()`) fixes valid existing occupancy and adds as many reserve animals as fit, without writing placement until confirmation; `actionContext.prefill=false` opts out.
- Farmyard-only exchanges (`CardExchange.fromFarmyard` / `Trade.fromFarmyard`) pay only with currently placed animals in both the exchange and the ordered feeding path; the feed request publishes the placed balance, and animals gained in the same feeding batch are still unplaced.
- `animalKeysForState()` adds horses only with Farmers of the Moor. Breeding and score adjustments use `computeBreedableAnimalCount()` and `computeAnimalScoreAdjustment()`.
- Special stables use the card-effect trio `getSpecialStablePositions`, `applySpecialStable` and `getBuiltSpecialStables`, and core stables code imports no card. They are offered only when `actionContext.farmHand === true` (the Farm Expansion stables leaf), through protocol field `farmHandPositions`. Built ones project to `SerializedPlayerState.specialStables` (stripped on rehydration); an unaccepted position rejects the whole batch recoverably.

**Scoring.**

- `cardBonusVp` is the single category for non-printed card points, attributed by `cardId` / `cardType`; printed card VP stays in `cards`; public card markers may score negative. Each bonus source enters the category once: generic scoring already reads `cardStates[cardId].counters.bonusVp`, so a card storing points there never also returns them from `computeBonusScore`. The `bonus-vp` leaf (`params.amount`, default 1) and an exchange `sideEffect: { type: 'bonusVp' }` both write that counter. Old `cardsBonus` / `cardStateBonusVp` / `cardBonus` shapes are gone.
- Scoring Reserve is a final-scoring reservation, not payment, recorded through `special-effect` `record-scoring-reserve-bonus`. `computeScores()` deducts every selected reserve from a scoring clone before the costed-bonus solver, resource-based major scoring reads that clone, and an unpayable combination invalidates the bundle.

**Major improvement supply** ([ADR 0006](../adr/0006-stack-aware-major-improvement-supply.md), [ADR 0016](../adr/0016-separate-supply-family-from-improvement-identity.md)): variant templates create real card-ID stacks; the board exposes each stack's top. Purchase, return and swap go through supply helpers, and production reads use supply query helpers. Upgrade identity uses `*Identity` metadata, never the stack's `familyId`. Duplicates keep their concrete IDs as source and attribution. Bottom-row rules use `isBottomRowMajorImprovement()` / `getAvailableBottomRowMajorImprovementIds()`.

Tests: `shared/domain/__tests__/`, `shared/actions/__tests__/animals.test.ts`, `shared/actions/effects/__tests__/reorganize-engine.test.ts`.

