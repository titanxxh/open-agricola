# Card Implementation Status

[English](card_implementation_status.md) | [中文](card_implementation_status_zh.md)

> This English file is canonical. [`card_implementation_status_zh.md`](card_implementation_status_zh.md) is its Chinese mirror.

> Updated 2026-10-21. Rule authority comes from publisher card text and printed icons, official rulings, and recorded maintainer decisions. The reference implementation is implementation evidence only.

> This document covers official cards only. Hook ownership is derived from `ALL_CARD_IMPLS`; query the registry instead of mirroring it here.

## 1. Open issues by priority

Reference PHP paths are relative to the reference implementation's source tree; OA paths are relative to this repository.

No entries are open.

## 2. Accepted differences

Unless the product direction changes, the following are not bugs. Every card not listed here or in [Source exclusions](#5-source-exclusions) is aligned; its behavior is defined by its file under `shared/cards/` and locked in by the tests next to it. A known difference or high-confidence behavior risk that still has to be fixed, or confirmed by added tests, is an open issue, not an accepted difference. [Per-card notes](#6-per-card-notes) add detail where a category row is not enough.

| Category | Cards |
|---|---|
| Maintainer ruling for exhausted ordinary decks: a satisfied tier can be completed; each eligible card type independently draws up to three remaining cards and keeps one; an empty type is skipped, completion still succeeds when both are empty, and there is no downgrade, reshuffle or later compensation. This is an OA ruling, not an official FAQ. | `PS03` |
| Reseller excludes an entire printed-cost candidate that contains a stable or fence component, and keeps its once-per-game opportunity when no supported candidate remains. This does not rule out future component refunds, tracked in [#849](https://github.com/titanxxh/open-agricola/issues/849). | `E146_Reseller` |
| Schema-up metadata replaces the reference's custom `isBuyable`. | `A003_PaperKnife`, `B056_Brook`, `B074_ThickForest` |
| Not implemented by the reference; OA implements or extends them as product features. Cards numbered 169–180 are 5+ extensions. | `A113_HeresyTeacher`, `A169_OffSiter`, `A170_Hayward`, `A171_Sidekick`, `A172_BoatPainter`, `A173_ClayThief`, `A174_MasterHora`, `A175_HollowGardener`, `A176_Wheelmaker`, `A177_Middleman`, `A178_CarpentersBoy`, `A179_MountainShepherd`, `A180_AnimalBrander`, `B169_LivestockSustainer`, `B170_CorralBuilder`, `B171_GreenhouseBuilder`, `B172_CattleCaregiver`, `B173_Sweeper`, `B174_RiverbankGardener`, `B175_FieldOverseer`, `B176_VillageIdiot`, `B177_StoneClawer`, `B178_TagAlong`, `B179_WildBoarHunter`, `B180_GameTeaser`, `C169_FastMason`, `C170_AmateurFencer`, `C171_YoungArtist`, `C172_FieldCounter`, `C173_TopOuter`, `C174_StoneCustodian`, `C175_VillageTeacher`, `C176_Cleanacre`, `C177_MountainHiker`, `C178_OnSiteReverend`, `C179_BovinePioneer`, `C180_Trapper`, `D025_WitchesDanceFloor`, `D159_ReedSeller`, `D169_Plowsmith`, `D170_FoldBuilder`, `D171_SeniorTeacher`, `D172_PutcherMaker`, `D173_TownClerk`, `D174_LoessGardener`, `D175_Countryman`, `D176_Woodshacker`, `D177_Graduate`, `D178_SubstituteTeacher`, `D179_Bullcatcher`, `D180_PartTimeWorker` |
| A card played inside a reaction window does not join that window, so its reaction in the same phase is not offered for the current host. The reference can activate such a hand card once it is played. Maintainer decision of 2026-10-20; the mechanism discussion continues in [#1181](https://github.com/titanxxh/open-agricola/issues/1181). | Cards that play a card inside a reaction window, such as `C131_PrivateTeacher` playing `B142_Greengrocer` during Grain Seeds, whose before sources were captured before the occupation was played. It gives no vegetable that time and triggers normally on a later Grain Seeds use |
| Banned by the reference; OA keeps them. | `A131_CraftTeacher`, `A133_Braggart`, `A014_CarpentersHammer`, `A033_BigCountry`, `A039_Chapel`, `A048_ShavingHorse`, `A082_WorkCertificate`, `A097_Freshman`, `B010_Caravan`, `B117_Informant`, `B132_EstateMaster`, `B151_LittlePeasant`, `B015_CarpentersBench`, `B161_Weakling`, `B021_HayloftBarn`, `B022_WalkingBoots`, `C102_TreeGuard`, `C125_Nightworker`, `C028_TeachersDesk`, `C031_WritingChamber`, `C003_CarriageTrip`, `C060_SmallPottersOven`, `C063_CraftBrewery`, `C099_GardenDesigner`, `D137_TradeTeacher`, `D019_PulverizerPlow`, `D021_Recruitment`, `D033_SummerHouse`, `D004_CrossCutWood`, `D074_RoyalWood`, `D092_ChildOmbudsman`, `D097_BeggingStudent`, `E022_GuestRoom` |
| Stable / FarmHand model differs from the reference. | `B085_FarmHand` |
| Card-driven worker moves reuse ordinary placement legality, including occupied targets allowed by capacity or a modifier despite the printed "unoccupied"; ordinary target `isDoable` vetoes still apply. Each E010 worker on Farmland independently chooses 1 food or an exact move of that worker. A D051 move and each worker actually moved by E010 open a fresh rules Turn Scope without adding a rotation opportunity; E010's food branch opens no Turn. | `D051_Archway`, `E010_StrawHat` |
| Candidate Closure: the optional branch candidate set is a legal superset of the reference's single topological-order product. After solver-level dominance pruning (ADR 0004) the player's options match the reference's optimal set, and a single option auto-resolves. Virtual payment resources provided by a card enter `resourcesPaid` under their own key and do not dominate, or get dominated by, inventory resources. | All card-purchase / unit-trade cost modifiers; action-space payment resources such as B155 |
| Candidate Closure: equivalent candidate rows (same resources and `originalFeeIndex`, differing only in sources) keep one representative row (fewest sources, then key order; ADR 0004). Players no longer see payment options that differ only in attribution, and cards on an unselected chain are not shown in that option's hover attribution. | All card-purchase cost modifiers (the C95/E109 fixed-price twins, the A75/D117 bypass chain, etc.) |
| B104 uses the default system exchange windows; its former standalone pre-scoring opportunity is intentionally removed. Harvest recipes remain available. | `B104_SheepWalker` |
| OA keeps an explicit choice of how many card-held fences to use. After skipping, a submission is rejected when ordinary stock is short; card stock is not used automatically. Selected entities are independent of B015's discount: selecting four and building four consumes four; selecting five and building four still consumes four. | `E074_AshTrees` |
| When no opposite crop seed is available, the impossible optional sow branch auto-skips instead of showing a decline prompt. | `E070_CropRotationField` |

## 3. Infrastructure backlog

Register a cross-card mechanism here only while it is still unimplemented. Remove the entry once the mechanism is implemented and covered by a test or a gate, and record the new generic mechanism in its module document under `docs/architecture/`. Completed work lives in pull requests, ADRs and tests, not here.

No entries are open.

## 4. Reference anti-patterns: do not copy

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
- Do not put a space-use reward that the reference resolves before its host on `after`. Choose the listener phase by [ADR 0033](adr/0033-card-listener-timing-follows-the-reference.md), so a `before` reward is usable within that same action.
- Subscribe action-space before / complete reactions to the existing `place-farmer` lifecycle and filter `context.space`; do not approximate complete use with wildcard internal-node reactions.
- Keep listener permission in the shared closed target/phase contract; do not infer it from executable action registration, omit selectors, or mutate registered selector objects.
- Reference platform status fields such as `banned` and `implemented` must not drive OA product behavior automatically.
- Moor Special Action reactions use the unified `moor-action` before/after identity and typed native trigger facts; concrete special-action IDs are execution/filter/source data, never listener targets.

## 5. Source exclusions

| Source | Reason |
|---|---|
| `C054_MarketStall` | Legacy reference source file of `C054_MarketBooth`. |
| `C071_SlurrySpreader` | Legacy, misnamed reference source file of `C071_Slurry`. |
| `D011_LawnFertilzer` | Misspelled reference source file of `D011_LawnFertilizer`. |
| `E132_Shearer` | Legacy reference source file of `E132_VeggieLover`. |
| Cards the reference marks `implemented=false` with no runtime behavior, such as `C071_Slurry` | Outside behavior-alignment scope unless OA implements them explicitly as a product extension. |

## 6. Per-card notes

Detail for cards in [Accepted differences](#2-accepted-differences) whose difference does not fit in the category row.

| Card | Notes |
|---|---|
| `A082_WorkCertificate` | The runtime removes resources from the accumulation space with the shared partial-take helper. |
| `A113_HeresyTeacher` | OA applies the printed bottom-vegetable effect to every eligible Logical Field, including Card Fields. |
| `A169_OffSiter` | It totals the printed wood / clay / reed / stone cost (including fee cost) of the owner's built majors and of minors that `alsoCountsAs` a major; the first time the total reaches 9+, it locks in 1 extra room capacity. |
| `A170_Hayward` | When fencing is legal, the owner can trigger an ordinary fence flow as an anytime action without placing a worker; ordinary fence listener semantics still apply. |
| `A171_Sidekick` | Immediately after placing on an action card, the owner may pay 1 food and use `place-farmer-on-space` to place another available worker on the revealed action card immediately to the left. Fixed board spaces can neither start nor continue the chain, and unrevealed round slots are not skipped. Admission uses the ordinary placement checklist (`canPlaceWorkerOnSpace`) after reserving that food, including the target's hook / listener vetoes and, under Farmers of the Moor, a healthy person, so the owner never pays for a target with no executable option. The cascaded action-space immediately-after listener activates immediately after each new-person target use completes and keeps checking leftward, stopping when there is no left neighbour, no food or no person who may enter, when the target is occupied / blocked / not open / not executable, or when `sidekickChain` already visited it. |
| `A173_ClayThief` | After round-start accumulation, if hollow-56 holds clay and is unused, the owner may mark it used / update the infobox and take all its current clay; no clay or already used means no trigger. |
| `A174_MasterHora` | Before the owner places on one of the six grey 5/6-player linked extension spaces (including choosing a card-granted extra `place-farmer` target), they may exchange 1 food for 1 vegetable. Shared current-step admission permits trying through this `before`; if the host is still unavailable afterwards, it waits for a legal anytime action or enters blocked until the player undoes explicitly. |
| `A177_Middleman` | On play, it places owner-only 1 stone + 1 food attachments on the current meeple-symbol extension spaces; when the owner later uses exactly that space, they take and clear its attachment. A linked partner does not take it implicitly, and a non-owner neither takes nor consumes it; the frontend only renders the attachment resources and owner hover text the backend serializes. |
| `A180_AnimalBrander` | Each original animal branch of animal-market-56 is expressed in a local flow; after the owner picks a branch and completes its original result, they may pay 1 more food to repeat the same option. Food from the original action can pay for the repeat, so the zero-food sheep branch can end with two sheep and one food; the cattle branch uses local pay / gain without a separate action, and accepting costs 3 food in total for 2 cattle, while skipping keeps only the original result. |
| `B015_CarpentersBench` | Its granted fence action declares one wood-cost discount, exactly one new pasture and only ordinary fences. `paymentBudget: { wood: collectedWood }` caps the final payment after other legal cost effects, so only the wood taken in this action can be used. It provides no fence entities and installs no global discount; `fencePolicy.promptHintKey` shows the one-pasture restriction. |
| `B021_HayloftBarn` | Grain obtained through a resource exchange triggers it through the provenance helper; the empty-card family growth uses `hasInactiveWorkerInSupply` and does not offer the newcomer flow when only removed workers remain. |
| `B022_WalkingBoots` | A temporary from-supply worker is marked `removedFromSupply` when it returns, so later family-growth supply and the family-member limit on the player panel no longer count that token. |
| `B085_FarmHand` | The FarmHand stable is built through the Farm Expansion `stables` leaf wrapper (`actionContext.farmHand`) and shares the stables payment, `farm.stableBuilt` event and after-stables listener chain; it costs 2 wood and takes discounts such as C88. OA lets one stables leaf mix ordinary stables with the FarmHand special stable. Difference: the FarmHand position is not in `stableTiles` (no animal-zone or loose-stable capacity) and adds only +1 housing through `computeExtraRoomCapacity`; `shared/domain/stables.ts` derives its stable count separately. `farm.stableBuilt` items carry `kind: 'normal' \| 'special'`, and special items carry `sourceCardId`. Returning stables (D102 / E76 through the `stable-removal` helper) lists special stables from the generic aggregate and calls the source card's `returnSpecialStable`; FarmHand clears `extraData.position`, releases one stable supply and drops its housing capacity to 0, but keeps `flagged` (once per game, not offered again) and starts no animal reorganization. Built special stables reach the client through the generic `getBuiltSpecialStables(player)` hook as `SerializedPlayerState.specialStables`; the frontend never reads `cardStates['B085_FarmHand']` or imports `shared/cards`. |
| `B170_CorralBuilder` | Triggers independently at the round start that reveals Pig Market / Cattle Market and may run a B2-style free, exactly-one-space pasture non-action fence flow; there is no compensation when a one-space pasture is illegal. |
| `B171_GreenhouseBuilder` | Registers an owner-only dynamic Action Space that exposes a branch only for printed `fencing` / `house-redevelopment` / `vegetable-seeds` spaces revealed before the current round and executable by the owner. |
| `B173_Sweeper` | After the owner uses a meeple-symbol extension space, the shared stored-food cashout helper puts 1 food on the card; a one-time anytime cashout takes the food and marks the card used. The occupation still counts as played and accumulates no further. |
| `B175_FieldOverseer` | At the end of the harvest field phase, it counts grain fields only in other players' `harvestReapSummary` and pays food / grain / vegetable for the highest threshold of 3 / 4 / 6+. |
| `B176_VillageIdiot` | On play it discards the rest of the occupation hand; hand / played `occupation.isDoable` and `providesOccupation` minor interception keep it the lone occupation, and after an opponent uses `meeting-place` the owner gets 1 wood + 1 food. |
| `B178_TagAlong` | Immediately after an opponent uses a Resource Market variant, the owner may use `place-farmer-on-space` to put an available worker on the same occupied Action Space and run its action; it does not trigger for the owner's own use, non-Resource-Market spaces, no person who may enter (a healthy one under Farmers of the Moor), or a blocked / unexecutable target. |
| `B179_WildBoarHunter` | Before returning home it counts wood accumulation spaces by actual `takenBy` occupancy; at 3+ and if the owner has wood, they may exchange 1 wood for 1 boar. |
| `C169_FastMason` | Immediately after the owner collects from a clay / stone accumulation space, they may renovate in the matching material: clay collection only to clay, stone collection only from a clay house to stone, with `exactCost` dropping the reed. |
| `C170_AmateurFencer` | On buy, if the owner has no pasture and a one-space fence is legal, they may run a B2-style free, exactly-one-space pasture non-action fence flow. |
| `C171_YoungArtist` | In the returning-home phase, if the owner has food and at least one branch is feasible, they may pay 1 food and then either take a worker-less Minor Improvement action or draw up to 2 minors from the ordinary minor deck into hand. The Minor Improvement branch is judged after reserving / paying that food, so it is never offered when nothing would be buyable; infeasible branches are hidden, and there is no keep-one choice. |
| `C172_FieldCounter` | Each field an opponent plows puts 1 food on the card, counted from `farm.fieldPlowed.fields`; the owner's own plowing does not trigger; cashout reuses the shared stored-food helper. |
| `C173_TopOuter` | After any player uses house-building-56, the owner takes all current food from the linked traveling-players-56; no food or a space other than house-building-56 means no trigger. |
| `C175_VillageTeacher` | Immediately after the owner uses Lessons, the actual number of occupied Lessons spaces this round (1 / 2 / 3) pays food / grain / vegetable; linked blocked spaces do not count. |
| `C180_Trapper` | After the owner uses wood accumulation, if the actual number of occupied wood accumulation spaces is 2 / 3 / 4, they may pay 1 food to buy a sheep / boar / cattle. |
| `D074_RoyalWood` | Stables payment is counted through after-pay provenance because of the afterHost slot. |
| `D159_ReedSeller` | OA implements public sequential purchase responses, seller-selected buyers and non-prepaid resource commitments; the trade also works during feeding. |
| `D170_FoldBuilder` | Registers a dynamic Action Space for all players; a non-owner first pays the owner 1 food, then runs a forbid-cancel fence flow and gains 1 sheep; the owner uses it without paying. |
| `D171_SeniorTeacher` | Listens to `pay.after` of an opponent's Lessons occupation payment and recovers the actual food paid with `sumActualPaidResource()` from `paymentSources`; non-Lessons, owner payments and non-food replacements do not trigger, and when food is actually paid the owner gains exactly 1 food. |
| `D173_TownClerk` | When any player builds a card where `cardCountsAs(..., 'major')`, including minors with `alsoCountsAs: ['major']`, 1 food goes on the owner's card; ordinary minors do not trigger; cashout reuses the shared stored-food helper. |
| `D175_Countryman` | After any player's renovation-providing Action Space, the owner may sow exactly one field; non-renovation spaces, card-granted non-renovation spaces in disguise, or having no legal one-field sow do not trigger. |
| `D176_Woodshacker` | In the work phase, the owner's first / second wood-accumulation use this round gives an extra 1 / 2 clay, counted by actual uses this round (repeated uses of the same space count) and reset when returning home. |
| `D178_SubstituteTeacher` | Registers an owner-only Action Space, available once all three visible Lessons spaces are actually occupied; the reward is 1 building resource or grain + vegetable. |
| `D179_Bullcatcher` | Registers an owner-only Action Space, available when the Action Spaces of round slots 3 and 6 are both occupied and the owner still has an available worker; using it gives 1 cattle + 2 food. |
| `D180_PartTimeWorker` | At the collect step of an accumulation space with exactly 2 / 4 / 6 goods, a `computeReplace` alternative offers to take all but 1 / 2 / 3 goods (every legal combination for mixed goods) and gain a sheep / boar / cattle. Left goods never reach the player, so "take at least N" cards count only the goods taken. A card's partial take is not a use of the space and never offers it. With mixed goods each taken type is a separate partial take. |
