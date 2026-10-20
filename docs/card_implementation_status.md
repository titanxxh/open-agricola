# Card Implementation Status

[English](card_implementation_status.md) | [中文](card_implementation_status_zh.md)

> This English file is canonical. [`card_implementation_status_zh.md`](card_implementation_status_zh.md) is its Chinese mirror.

> Updated 2026-10-20. Rule authority comes from publisher card text and printed icons, official rulings, and recorded maintainer decisions. The reference implementation is implementation evidence only.

## 1. Open issues by priority

Reference PHP paths are relative to the reference implementation's source tree; OA paths are relative to this repository.

| Priority | Scope | Open work |
|---|---|---|
| Deferred by maintainer | `C131_PrivateTeacher` [#1175](https://github.com/titanxxh/open-agricola/issues/1175) | Unchanged until a ruling confirms whether a newly played occupation can trigger in the same Grain Seeds use. |

## 2. Accepted differences

Unless the product direction changes, the following are not bugs.

| Category | Cards |
|---|---|
| Maintainer ruling for exhausted ordinary decks: a satisfied tier can be completed; each eligible card type independently draws up to three remaining cards and keeps one; an empty type is skipped, completion still succeeds when both are empty, and there is no downgrade, reshuffle or later compensation. This is an OA ruling, not an official FAQ. | `PS03` |
| Reseller excludes an entire printed-cost candidate that contains a stable or fence component, and keeps its once-per-game opportunity when no supported candidate remains. This does not rule out future component refunds, tracked in [#849](https://github.com/titanxxh/open-agricola/issues/849). | `E146_Reseller` |
| Schema-up metadata replaces the reference's custom `isBuyable`. | `A003_PaperKnife`, `B056_Brook`, `B074_ThickForest` |
| Not implemented by the reference; OA implements or extends them as product features. | `A113_HeresyTeacher`, `A169_OffSiter`, `A170_Hayward`, `A171_Sidekick`, `A173_ClayThief`, `A174_MasterHora`, `A177_Middleman`, `A180_AnimalBrander`, `B170_CorralBuilder`, `B171_GreenhouseBuilder`, `B173_Sweeper`, `B175_FieldOverseer`, `B176_VillageIdiot`, `B178_TagAlong`, `B179_WildBoarHunter`, `C169_FastMason`, `C170_AmateurFencer`, `C171_YoungArtist`, `C172_FieldCounter`, `C173_TopOuter`, `C175_VillageTeacher`, `C180_Trapper`, `D025_WitchesDanceFloor`, `D170_FoldBuilder`, `D171_SeniorTeacher`, `D173_TownClerk`, `D175_Countryman`, `D176_Woodshacker`, `D178_SubstituteTeacher`, `D179_Bullcatcher`, `D180_PartTimeWorker` |
| Banned by the reference; OA keeps them. | `A131_CraftTeacher`, `A133_Braggart`, `A014_CarpentersHammer`, `A033_BigCountry`, `A039_Chapel`, `A048_ShavingHorse`, `A082_WorkCertificate`, `A097_Freshman`, `B010_Caravan`, `B117_Informant`, `B132_EstateMaster`, `B151_LittlePeasant`, `B015_CarpentersBench`, `B161_Weakling`, `B021_HayloftBarn`, `B022_WalkingBoots`, `C102_TreeGuard`, `C125_Nightworker`, `C028_TeachersDesk`, `C031_WritingChamber`, `C003_CarriageTrip`, `C060_SmallPottersOven`, `C063_CraftBrewery`, `C099_GardenDesigner`, `D137_TradeTeacher`, `D019_PulverizerPlow`, `D021_Recruitment`, `D033_SummerHouse`, `D004_CrossCutWood`, `D074_RoyalWood`, `D092_ChildOmbudsman`, `D097_BeggingStudent`, `E022_GuestRoom` |
| Stable / FarmHand model differs from the reference. | `B085_FarmHand` |
| Card-driven worker moves reuse ordinary placement legality, including occupied targets allowed by capacity or a modifier. A D051 move and each worker actually moved by E010 open a fresh rules Turn Scope without adding a rotation opportunity; E010's food branch opens no Turn. | `D051_Archway`, `E010_StrawHat` |
| Candidate Closure: the optional branch candidate set is a legal superset of the reference's single topological-order product. After solver-level dominance pruning (ADR 0004) the player's options match the reference's optimal set, and a single option auto-resolves. Virtual payment resources provided by a card enter `resourcesPaid` under their own key and do not dominate, or get dominated by, inventory resources. | All card-purchase / unit-trade cost modifiers; action-space payment resources such as B155 |
| Candidate Closure: equivalent candidate rows (same resources and `originalFeeIndex`, differing only in sources) keep one representative row (fewest sources, then key order; ADR 0004). Players no longer see payment options that differ only in attribution, and cards on an unselected chain are not shown in that option's hover attribution. | All card-purchase cost modifiers (the C95/E109 fixed-price twins, the A75/D117 bypass chain, etc.) |
| B104 uses the default system exchange windows; its former standalone pre-scoring opportunity is intentionally removed. Harvest recipes remain available. | `B104_SheepWalker` |

## 3. Simplicity review

Line counts are a signal, not a conclusion. Method: count non-empty, non-comment lines in the current Card Source file and the canonical reference PHP file, keeping method and function declaration lines. Exclude only OA `import` / `export` lines and the reference's `<?php` / `namespace` / `use` lines.

Remove the reference's own anti-patterns before comparing. If the reference supplies a card's behavior through main-path code such as `Actions/*`, `Core/*` or `Models/*`, or through an explicit card-ID branch in another card's file, the card is not compared. Cards the reference marks `implemented=false` have nothing to compare against and are skipped without being listed.

After those exclusions, six fairly comparable cards have an OA/reference ratio above 1.5:

| Card | Reference | OA | Ratio | Reason / follow-up |
|---|---:|---:|---:|---|
| `B093_Confidant` | 59 | 132 | 2.24 | The reference chains the post-return sow/fence implicitly through a `FOODPLUS` future meeple plus `getPostReceiveBonus()`. OA also handles `reserveResources` during occupation payment, Lessons doability, resolved future-meeple provenance, the duplicate guard `lastResolvedRound`, and the 1-wood fence policy. Simplify once future meeples support a post-receive bonus. |
| `C150_ParrotBreeder` | 67 | 147 | 2.19 | Stays card-local: reserve 1 grain before checking the sole target, then pay and perform a constrained placement through the existing turn-replacement flow. The right-hand neighbour target follows the actual placement chronology, including moves, and does not depend on after-listener settlement order. Session regressions cover admission, payment, copying, undo and rotation (#1117). |
| `B157_Salter` | 104 | 177 | 1.70 | The reference's `payNode` / `argsSalt` / `actSalt` handle animal choice and payment. OA needs a custom `resource-quantity-select` ad-hoc action, checks that animals come from the farm with an empty reserve, removes animals from the board, and adds a single-animal shortcut, a future food schedule and logs. The reference is long too; low priority. |
| `A130_MummysBoy` | 53 | 90 | 1.70 | The reference uses `Globals::getPlacedFarmers()` / the `Farmers` manager to find the second farmer and inject a dummy action. OA implements placement order, an occupied-space option, Meeting Place filtering, a once-per-round flag and start-of-turn cleanup explicitly. Same class as C150: keep it card-local unless an occupied-action helper is extracted. |
| `B156_StorehouseKeeper` | 29 | 44 | 1.52 | The reference uses `isActionCardEvent('ResourceMarket')` plus a `gainNode` XOR. OA lists the Resource Market variants explicitly and wraps a listener / typed flow. Borderline; extract a helper only if more action-space alias cards appear. |
| `B107_Manservant` | 33 | 50 | 1.52 | The reference's `onBuy` reuses `onPlayerAfterRenovation()` and returns `futureMeeplesNode` directly. OA reuses `placeFood`, an after-renovation listener, a stone-house guard and `queueFutureMeeples` plus a node bridge. Borderline; low priority. |

Cards excluded because of reference anti-patterns:

| Card | Reason |
|---|---|
| `D036_BreedRegistry` | The reference updates this card's infobox from `Core/`. |
| `E161_ElderBaker` | The reference special-cases this card in `ActionCards.js` and on an `Actions/` main path. |
| `C088_CarpentersApprentice` | The reference special-cases this card on two `Actions/` main paths. |
| `A041_VegetableSlicer` | The reference special-cases this card on an `Actions/` payment path. |
| `A087_Conservator` | The reference special-cases this card on an `Actions/` renovation path. |
| `D131_CraftsmanshipPromoter` | The reference special-cases this card on an `Actions/` main path. |
| `D001_ZigzagHarrow` | The reference provides a geometry helper for this card in `Models/`. |
| `E016_BriarHedge` | The reference special-cases this card on an `Actions/` fencing path. |
| `B138_ForestGuardian` | Other reference card paths enumerate this card explicitly. |
| `C016_FieldFences` | The reference special-cases this card on an `Actions/` fencing path. |
| `C027_Blueprint` | The reference special-cases this card on an `Actions/` main path. |
| `B146_Illusionist` | Other reference card paths enumerate this card explicitly. |
| `B042_ForestInn` | Other reference card paths enumerate this card explicitly. |
| `C162_ForestOwner` | Other reference card paths check this card explicitly. |
| `A106_SlurrySpreader` | The reference special-cases this card on an `Actions/` harvest path. |
| `D132_HideFarmer` | The reference special-cases this card on a `Managers/` scoring path. |
| `E096_Elder` | The reference special-cases this card on a `States/` turn path. |
| `E155_Visionary` | The reference special-cases this card on an `Actions/` path and elsewhere. |
| `E153_StoneSculptor` | Other reference card paths enumerate this card explicitly. |

Extract a new abstraction only when the same helper serves at least two current or near-term target cards; otherwise keep the logic card-local.

## 4. Infrastructure backlog

Register a cross-card mechanism here only while it is still unimplemented. Remove the entry once the mechanism is implemented and covered by a test or a gate, and record the new generic mechanism in its module document under `docs/architecture/`. Completed work lives in pull requests, ADRs and tests, not here.

No entries are open.

## 5. Reference anti-patterns: do not copy

- Do not treat imported prerequisite metadata as rule authority. Prerequisites follow publisher card text, printed icons and official rulings; a field the reference runtime ignores can become a real restriction under OA's generic validation.
- Do not approximate reveal or start-of-work reactions with a mixed round-start scan, restore preparation windows by zone index, or drop legal reactions by current affordability during source discovery.
- Do not infer purchase provenance from the first placement space, the outer frame or the last worker; a newly granted purchase keeps its own node identity.
- Do not implement a one-time own-play benefit with an `occupation` / `improvement.after` listener, and do not react to `pay.after` when the printed condition is a successfully played or built card. Use `onBuy` for the card's own activation and the committed host action for later reactions.
- Generic consumers must not read one card's raw state or prompt key, enumerate internal fields to build a display, or send full internal state to its owner. Add a source-owned rule / presentation query or a reusable explicit flow contract; the default card-state architecture gate enforces these boundaries.
- Do not centralize `cardId` dispatch in `SpecialEffect.js` or per-card JS methods; OA keeps typed pending / action flows.
- Do not put card names or one-off logic on the action / main path, such as a global Scythe-style flag or C88's stable / fence cost relocation; OA prefers card-local hooks and helpers.
- The fencing main path must not add card-ID branches for C1 / B30 / E149 or per-card switches such as `noWoodPalisades` / `midnightFencer`; express the differences with `FenceSegment.type` / `source` and the generic `fencePolicy`.
- Do not copy mutable PHP args or in-place cost rewriting; OA keeps structured modifiers and payment enumeration.
- Derive counter-based infobox text in the owning card's `getStatePresentation`; do not synchronize a second copy through internal storage-action listeners.
- Subscribe action-space before / complete reactions to the existing `place-farmer` lifecycle and filter `context.space`; do not approximate complete use with wildcard internal-node reactions.
- Keep listener permission in the shared closed target/phase contract; do not infer it from executable action registration, omit selectors, or mutate registered selector objects.
- Reference platform status fields such as `banned` and `implemented` must not drive OA product behavior automatically.
- Moor Special Action reactions use the unified `moor-action` before/after identity and typed native trigger facts; concrete special-action IDs are execution/filter/source data, never listener targets.

## 6. Cards that use the reference Special Effect

| Deck | Cards |
|---|---|
| A | `A102_Grocer`, `A112_ScytheWorker`, `A132_Publican`, `A136_DrudgeryReeve`, `A137_RiverineShepherd`, `A144_Sequestrator`, `A150_Stagehand`, `A158_CulinaryArtist`, `A159_JoineroftheSea`, `A162_ForestTallyman`, `A165_PigBreeder`, `A017_ReclamationPlow`, `A022_Telegram`, `A025_Bassinet`, `A029_AleBenches`, `A039_Chapel`, `A003_PaperKnife`, `A040_PottersYard`, `A053_Claypipe`, `A058_AsparagusKnife`, `A070_LiftingMachine`, `A071_ClearingSpade`, `A072_CalciumFertilizers`, `A081_InterimStorage`, `A082_WorkCertificate`, `A084_Silage`, `A089_StablePlanner`, `A092_AdoptiveParents` |
| B | `B124_Trimmer`, `B146_Illusionist`, `B157_Salter`, `B019_MoldboardPlow`, `B021_HayloftBarn`, `B023_FinalScenario`, `B024_Lasso`, `B034_SpecialFood`, `B003_Moonshine`, `B042_ForestInn`, `B048_ForestStone`, `B055_MaintenancePremium`, `B067_HandTruck`, `B076_Ceilings`, `B081_Handcart`, `B083_MuddyPuddles`, `B085_FarmHand` |
| C | `C104_Collector`, `C115_Sower`, `C120_AgriculturalLabourer`, `C130_OutskirtsDirector`, `C132_TimberShingleMaker`, `C133_Soldier`, `C142_MarketCrier`, `C146_WorkshopAssistant`, `C148_MudWallower`, `C151_SowingDirector`, `C153_PatternMaker`, `C156_HoofCaregiver`, `C162_ForestOwner`, `C167_CattleBuyer`, `C168_AnimalCatcher`, `C018_RollOverPlow`, `C019_SwingPlow`, `C001_Overhaul`, `C022_BasketChair`, `C023_JobContract`, `C024_BedintheGrainField`, `C025_SteamMachine`, `C029_BeerTable`, `C051_FishingNet`, `C057_Crudite`, `C063_CraftBrewery`, `C067_MineralFeeder`, `C069_LandConsolidation`, `C075_Firewood`, `C084_PerennialRye`, `C085_DenBuilder`, `C087_Mason`, `C008_PlantFertilizer`, `C093_InnerDistrictsDirector`, `C099_GardenDesigner` |
| D | `D101_SugarBaker`, `D102_SampleStableMaker`, `D103_CanalBoatman`, `D107_Bellfounder`, `D010_StorksNest`, `D116_TreeInspector`, `D124_Emissary`, `D126_FieldCultivator`, `D127_HardworkingMan`, `D129_LumberVirtuoso`, `D134_OysterEater`, `D137_TradeTeacher`, `D138_PetLover`, `D014_HammerCrusher`, `D150_GodlySpouse`, `D157_PartyOrganizer`, `D158_BeanCounter`, `D161_CabbageBuyer`, `D167_PureBreeder`, `D020_TurnwrestPlow`, `D022_WorkPermit`, `D023_PioneeringSpirit`, `D026_CarpentersYard`, `D027_Retraining`, `D051_Archway`, `D066_PotterCeramics`, `D070_StrawManure`, `D071_Changeover`, `D072_StableManure`, `D074_RoyalWood`, `D082_HuntingTrophy`, `D092_ChildOmbudsman`, `D093_SheepInspector`, `D094_HenpeckedHusband`, `D096_Furnisher`, `D098_Transactor` |
| E | `E103_Wolf`, `E106_EmergencySeller`, `E010_StrawHat`, `E112_GrainThief`, `E123_ResourceHoarder`, `E125_DelayedWayfarer`, `E134_Omnifarmer`, `E148_Lazybones`, `E162_Entrepreneur`, `E166_Roastmaster`, `E167_DairyCrier`, `E022_GuestRoom`, `E027_PiggyBank`, `E004_Thunderbolt`, `E051_WhaleOil`, `E052_Cubbyhole`, `E053_BoarSpear`, `E058_LunchtimeBeer`, `E005_NightLoot`, `E073_Scythe`, `E074_AshTrees`, `E076_LumberPile`, `E078_SleightofHand`, `E081_AlchemistsLab`, `E083_ShepherdsWhistle`, `E085_MasterTanner`, `E086_PenBuilder` |

## 7. Hook inventory

Hook ownership is derived from `ALL_CARD_IMPLS` and is not mirrored here; query the registry directly instead of keeping a copy that drifts.

## 8. Source exclusions

| Source | Reason |
|---|---|
| `C054_MarketStall` | Legacy reference source file of `C054_MarketBooth`. |
| `C071_SlurrySpreader` | Legacy, misnamed reference source file of `C071_Slurry`. |
| `D011_LawnFertilzer` | Misspelled reference source file of `D011_LawnFertilizer`. |
| `E132_Shearer` | Legacy reference source file of `E132_VeggieLover`. |
| Cards the reference marks `implemented=false` with no runtime behavior | Outside behavior-alignment scope unless OA implements them explicitly as a product extension. |

## 9. Per-card appendix

Status values are `Aligned`, `Accepted difference`, `Needs review` and `Excluded`.

`Needs review` means not aligned: a known difference from the reference or a high-confidence behavior risk must be fixed, or confirmed by added tests, before the row becomes `Aligned`. It is not an accepted difference.

The full per-card table is not maintained here. Every card not listed is aligned; its behavior is defined by its file under `shared/cards/` and locked in by the tests next to it. Only deliberate deviations and exclusions are recorded.

| Card | Status | Notes |
|---|---|---|
| `A003_PaperKnife` | Accepted difference | Schema-up prerequisite / `isBuyable` metadata difference. |
| `A014_CarpentersHammer` | Accepted difference | Banned by the reference; OA keeps it by product policy. |
| `A033_BigCountry` | Accepted difference | Banned by the reference; OA keeps it by product policy. |
| `A039_Chapel` | Accepted difference | Banned by the reference; OA keeps it by product policy. |
| `A048_ShavingHorse` | Accepted difference | Banned by the reference; OA keeps it by product policy. |
| `A082_WorkCertificate` | Accepted difference | Banned by the reference; OA keeps it by product policy. The runtime removes resources from the accumulation space with the shared partial-take helper. |
| `A097_Freshman` | Accepted difference | Banned by the reference; OA keeps it by product policy. |
| `A113_HeresyTeacher` | Accepted difference | No reference runtime; OA applies the printed bottom-vegetable effect to every eligible Logical Field, including Card Fields. |
| `A131_CraftTeacher` | Accepted difference | Banned by the reference; OA keeps it by product policy. |
| `A133_Braggart` | Accepted difference | Banned by the reference; OA keeps it by product policy. |
| `A169_OffSiter` | Accepted difference | `implemented=false` in the reference; OA implements it as a 5+ extension. It totals the printed wood / clay / reed / stone cost (including fee cost) of the owner's built majors and of minors that `alsoCountsAs` a major; the first time the total reaches 9+, it locks in 1 extra room capacity. |
| `A170_Hayward` | Accepted difference | `implemented=false` in the reference; OA implements it as a 5+ extension. When fencing is legal, the owner can trigger an ordinary fence flow as an anytime action without placing a worker; ordinary fence listener semantics still apply. |
| `A171_Sidekick` | Accepted difference | `implemented=false` in the reference; OA implements it as a 5+ extension. After placing on an action card, the owner may pay 1 food and use `place-farmer-on-space` to place another available worker on the revealed action card immediately to the left. Fixed board spaces can neither start nor continue the chain, and unrevealed round slots are not skipped. Target doability is judged after reserving / paying that food and reuses flow child doability to include the target's hook / listener vetoes, so the owner never pays for a target with no executable option. The cascaded action-space after listener activates after each target use completes and keeps checking leftward, stopping when there is no left neighbour, no food or no worker, when the target is occupied / blocked / not open / not executable, or when `sidekickChain` already visited it. |
| `A173_ClayThief` | Accepted difference | `implemented=false` in the reference; OA implements it as a 5+ extension. After round-start accumulation, if hollow-56 holds clay and is unused, the owner may mark it used / update the infobox and take all its current clay; no clay or already used means no trigger. |
| `A174_MasterHora` | Accepted difference | `implemented=false` in the reference; OA implements it as a 5+ extension. Before the owner places on one of the six grey 5/6-player linked extension spaces (including choosing a card-granted extra `place-farmer` target), they may exchange 1 food for 1 vegetable. Shared current-step admission permits trying through this `before`; if the host is still unavailable afterwards, it waits for a legal anytime action or enters blocked until the player undoes explicitly. |
| `A177_Middleman` | Accepted difference | `implemented=false` in the reference; OA implements it as a 5+ extension. On play, it places owner-only 1 stone + 1 food attachments on the current meeple-symbol extension spaces; when the owner later uses exactly that space, they take and clear its attachment. A linked partner does not take it implicitly, and a non-owner neither takes nor consumes it; the frontend only renders the attachment resources and owner hover text the backend serializes. |
| `A180_AnimalBrander` | Accepted difference | `implemented=false` in the reference; OA implements it as a 5+ extension. Each original animal branch of animal-market-56 is expressed in a local flow; after the owner picks a branch and completes its original result, they may pay 1 more food to repeat the same option. Food from the original action can pay for the repeat, so the zero-food sheep branch can end with two sheep and one food; the cattle branch uses local pay / gain without a separate action, and accepting costs 3 food in total for 2 cattle, while skipping keeps only the original result. |
| `B010_Caravan` | Accepted difference | Banned by the reference; OA keeps it by product policy. |
| `B015_CarpentersBench` | Accepted difference | Banned by the reference; OA keeps it by product policy. Its granted fence action declares one wood-cost discount, exactly one new pasture and only ordinary fences. `paymentBudget: { wood: collectedWood }` caps the final payment after other legal cost effects, so only the wood taken in this action can be used. It provides no fence entities and installs no global discount; `fencePolicy.promptHintKey` shows the one-pasture restriction. |
| `E074_AshTrees` | Accepted difference | OA keeps an explicit choice of how many card-held fences to use. After skipping, a submission is rejected when ordinary stock is short; card stock is not used automatically. Selected entities are independent of B015's discount: selecting four and building four consumes four; selecting five and building four still consumes four. |
| `B021_HayloftBarn` | Accepted difference | Banned by the reference; OA keeps it by product policy. Grain obtained through a resource exchange triggers it through the provenance helper; the empty-card family growth uses `hasInactiveWorkerInSupply` and does not offer the newcomer flow when only removed workers remain. |
| `B022_WalkingBoots` | Accepted difference | Banned by the reference; OA keeps it by product policy. A temporary from-supply worker is marked `removedFromSupply` when it returns, so later family-growth supply and the family-member limit on the player panel no longer count that token. |
| `B056_Brook` | Accepted difference | Schema-up prerequisite / `isBuyable` metadata difference. |
| `B074_ThickForest` | Accepted difference | Schema-up prerequisite / `isBuyable` metadata difference. |
| `B085_FarmHand` | Accepted difference | The FarmHand stable is built through the Farm Expansion `stables` leaf wrapper (`actionContext.farmHand`) and shares the stables payment, `farm.stableBuilt` event and after-stables listener chain; it costs 2 wood and takes discounts such as C88. OA lets one stables leaf mix ordinary stables with the FarmHand special stable. Difference: the FarmHand position is not in `stableTiles` (no animal-zone or loose-stable capacity) and adds only +1 housing through `computeExtraRoomCapacity`; `shared/domain/stables.ts` derives its stable count separately. `farm.stableBuilt` items carry `kind: 'normal' \| 'special'`, and special items carry `sourceCardId`. Returning stables (D102 / E76 through the `stable-removal` helper) lists special stables from the generic aggregate and calls the source card's `returnSpecialStable`; FarmHand clears `extraData.position`, releases one stable supply and drops its housing capacity to 0, but keeps `flagged` (once per game, not offered again) and starts no animal reorganization. Built special stables reach the client through the generic `getBuiltSpecialStables(player)` hook as `SerializedPlayerState.specialStables`; the frontend never reads `cardStates['B085_FarmHand']` or imports `shared/cards`. |
| `B117_Informant` | Accepted difference | Banned by the reference; OA keeps it by product policy. |
| `B132_EstateMaster` | Accepted difference | Banned by the reference; OA keeps it by product policy. |
| `B151_LittlePeasant` | Accepted difference | Banned by the reference; OA keeps it by product policy. |
| `B161_Weakling` | Accepted difference | Banned by the reference; OA keeps it by product policy. |
| `B170_CorralBuilder` | Accepted difference | `implemented=false` in the reference; OA implements it as a 5+ extension. Triggers independently at the round start that reveals Pig Market / Cattle Market and may run a B2-style free, exactly-one-space pasture non-action fence flow; there is no compensation when a one-space pasture is illegal. |
| `B171_GreenhouseBuilder` | Accepted difference | `implemented=false` in the reference; OA implements it as a 5+ extension. Registers an owner-only dynamic Action Space that exposes a branch only for printed `fencing` / `house-redevelopment` / `vegetable-seeds` spaces revealed before the current round and executable by the owner. |
| `B173_Sweeper` | Accepted difference | `implemented=false` in the reference; OA implements it as a 5+ extension. After the owner uses a meeple-symbol extension space, the shared stored-food cashout helper puts 1 food on the card; a one-time anytime cashout takes the food and marks the card used. The occupation still counts as played and accumulates no further. |
| `B175_FieldOverseer` | Accepted difference | `implemented=false` in the reference; OA implements it as a 5+ extension. At the end of the harvest field phase, it counts grain fields only in other players' `harvestReapSummary` and pays food / grain / vegetable for the highest threshold of 3 / 4 / 6+. |
| `B176_VillageIdiot` | Accepted difference | `implemented=false` in the reference; OA implements it as a 5+ extension. On play it discards the rest of the occupation hand; hand / played `occupation.isDoable` and `providesOccupation` minor interception keep it the lone occupation, and after an opponent uses `meeting-place` the owner gets 1 wood + 1 food. |
| `B178_TagAlong` | Accepted difference | `implemented=false` in the reference; OA implements it as a 5+ extension. After an opponent uses a Resource Market variant, the owner may use `place-farmer-on-space` to put an available worker on the same occupied Action Space and run its action; it does not trigger for the owner's own use, non-Resource-Market spaces, no available worker, or a blocked / unexecutable target. |
| `B179_WildBoarHunter` | Accepted difference | `implemented=false` in the reference; OA implements it as a 5+ extension. Before returning home it counts wood accumulation spaces by actual `takenBy` occupancy; at 3+ and if the owner has wood, they may exchange 1 wood for 1 boar. |
| `C003_CarriageTrip` | Accepted difference | Banned by the reference; OA keeps it by product policy. |
| `C028_TeachersDesk` | Accepted difference | Banned by the reference; OA keeps it by product policy. |
| `C031_WritingChamber` | Accepted difference | Banned by the reference; OA keeps it by product policy. |
| `C060_SmallPottersOven` | Accepted difference | Banned by the reference; OA keeps it by product policy. |
| `C063_CraftBrewery` | Accepted difference | Banned by the reference; OA keeps it by product policy. |
| `C071_Slurry` | Excluded | `implemented=false` in the reference; no runtime alignment target. |
| `C099_GardenDesigner` | Accepted difference | Banned by the reference; OA keeps it by product policy. |
| `C102_TreeGuard` | Accepted difference | Banned by the reference; OA keeps it by product policy. |
| `C125_Nightworker` | Accepted difference | Banned by the reference; OA keeps it by product policy. |
| `C169_FastMason` | Accepted difference | `implemented=false` in the reference; OA implements it as a 5+ extension. After the owner collects from a clay / stone accumulation space, they may renovate in the matching material: clay collection only to clay, stone collection only from a clay house to stone, with `exactCost` dropping the reed. |
| `C170_AmateurFencer` | Accepted difference | `implemented=false` in the reference; OA implements it as a 5+ extension. On buy, if the owner has no pasture and a one-space fence is legal, they may run a B2-style free, exactly-one-space pasture non-action fence flow. |
| `C171_YoungArtist` | Accepted difference | `implemented=false` in the reference; OA implements it as a 5+ extension. In the returning-home phase, if the owner has food and at least one branch is feasible, they may pay 1 food and then either take a worker-less Minor Improvement action or draw up to 2 minors from the ordinary minor deck into hand. The Minor Improvement branch is judged after reserving / paying that food, so it is never offered when nothing would be buyable; infeasible branches are hidden, and there is no keep-one choice. |
| `C172_FieldCounter` | Accepted difference | `implemented=false` in the reference; OA implements it as a 5+ extension. Each field an opponent plows puts 1 food on the card, counted from `farm.fieldPlowed.fields`; the owner's own plowing does not trigger; cashout reuses the shared stored-food helper. |
| `C173_TopOuter` | Accepted difference | `implemented=false` in the reference; OA implements it as a 5+ extension. After any player uses house-building-56, the owner takes all current food from the linked traveling-players-56; no food or a space other than house-building-56 means no trigger. |
| `C175_VillageTeacher` | Accepted difference | `implemented=false` in the reference; OA implements it as a 5+ extension. After the owner uses Lessons, the actual number of occupied Lessons spaces this round (1 / 2 / 3) pays food / grain / vegetable; linked blocked spaces do not count. |
| `C180_Trapper` | Accepted difference | `implemented=false` in the reference; OA implements it as a 5+ extension. After the owner uses wood accumulation, if the actual number of occupied wood accumulation spaces is 2 / 3 / 4, they may pay 1 food to buy a sheep / boar / cattle. |
| `D004_CrossCutWood` | Accepted difference | Banned by the reference; OA keeps it by product policy. |
| `D019_PulverizerPlow` | Accepted difference | Banned by the reference; OA keeps it by product policy. |
| `D021_Recruitment` | Accepted difference | Banned by the reference; OA keeps it by product policy. |
| `D025_WitchesDanceFloor` | Accepted difference | Accepted behavior / product difference. |
| `D033_SummerHouse` | Accepted difference | Banned by the reference; OA keeps it by product policy. |
| `D051_Archway` | Accepted difference | The moved worker uses shared ordinary placement legality, including occupied targets allowed by capacity or a modifier despite the printed "unoccupied"; ordinary target `isDoable` vetoes still apply. |
| `D074_RoyalWood` | Accepted difference | Banned by the reference; OA keeps it by product policy. Stables payment is counted through after-pay provenance because of the afterHost slot. |
| `D092_ChildOmbudsman` | Accepted difference | Banned by the reference; OA keeps it by product policy. |
| `D097_BeggingStudent` | Accepted difference | Banned by the reference; OA keeps it by product policy. |
| `D137_TradeTeacher` | Accepted difference | Banned by the reference; OA keeps it by product policy. |
| `D159_ReedSeller` | Accepted difference | No reference runtime. OA implements public sequential purchase responses, seller-selected buyers and non-prepaid resource commitments; the trade also works during feeding. |
| `D170_FoldBuilder` | Accepted difference | `implemented=false` in the reference; OA implements it as a 5+ extension. Registers a dynamic Action Space for all players; a non-owner first pays the owner 1 food, then runs a forbid-cancel fence flow and gains 1 sheep; the owner uses it without paying. |
| `D171_SeniorTeacher` | Accepted difference | `implemented=false` in the reference; OA implements it as a 5+ extension. Listens to `pay.after` of an opponent's Lessons occupation payment and recovers the actual food paid with `sumActualPaidResource()` from `paymentSources`; non-Lessons, owner payments and non-food replacements do not trigger, and when food is actually paid the owner gains exactly 1 food. |
| `D173_TownClerk` | Accepted difference | `implemented=false` in the reference; OA implements it as a 5+ extension. When any player builds a card where `cardCountsAs(..., 'major')`, including minors with `alsoCountsAs: ['major']`, 1 food goes on the owner's card; ordinary minors do not trigger; cashout reuses the shared stored-food helper. |
| `D175_Countryman` | Accepted difference | `implemented=false` in the reference; OA implements it as a 5+ extension. After any player's renovation-providing Action Space, the owner may sow exactly one field; non-renovation spaces, card-granted non-renovation spaces in disguise, or having no legal one-field sow do not trigger. |
| `D176_Woodshacker` | Accepted difference | `implemented=false` in the reference; OA implements it as a 5+ extension. In the work phase, the owner's first / second wood-accumulation use this round gives an extra 1 / 2 clay, counted by actual uses this round (repeated uses of the same space count) and reset when returning home. |
| `D178_SubstituteTeacher` | Accepted difference | `implemented=false` in the reference; OA implements it as a 5+ extension. Registers an owner-only Action Space, available once all three visible Lessons spaces are actually occupied; the reward is 1 building resource or grain + vegetable. |
| `D179_Bullcatcher` | Accepted difference | `implemented=false` in the reference; OA implements it as a 5+ extension. Registers an owner-only Action Space, available when the Action Spaces of round slots 3 and 6 are both occupied and the owner still has an available worker; using it gives 1 cattle + 2 food. |
| `D180_PartTimeWorker` | Accepted difference | `implemented=false` in the reference; OA implements it as a 5+ extension. After a collect it reads the goods map of this `resource.moved` from that accumulation space to the player; exactly 2 / 4 / 6 goods let the owner optionally return 1 / 2 / 3 goods to the space for a sheep / boar / cattle. The `return-to-space` leaf derives from `resource.moved.from.spaceId` and carries the collected space's `targetSpaceId` explicitly, so a card-granted placement that collects from a space other than the outer one returns to the right space. Mixed resources enumerate every legal return combination, run serially alongside other `return-to-space` optional flows, and later returned resources never count toward the trigger. |
| `E010_StrawHat` | Accepted difference | Each worker on Farmland independently chooses 1 food or an exact move of that worker. Moves reuse shared ordinary placement legality, including occupied targets allowed by capacity or a modifier despite the printed "unoccupied"; ordinary target `isDoable` vetoes still apply. |
| `E022_GuestRoom` | Accepted difference | Banned by the reference; OA keeps it by product policy. |
| `E070_CropRotationField` | Accepted difference | When no opposite crop seed is available, the impossible optional sow branch auto-skips instead of showing a decline prompt. |
