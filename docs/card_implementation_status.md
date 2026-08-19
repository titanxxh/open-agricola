# Card Implementation Status Report

[English](card_implementation_status.md) | [中文](card_implementation_status_zh.md)

> [`card_implementation_status.md`](card_implementation_status.md) is canonical. This file has a maintained Chinese mirror at [`card_implementation_status_zh.md`](card_implementation_status_zh.md).

> Generated and last updated on 2026-07-13. This file replaces `docs/card_desc_audit.md`, `docs/card_progress.md`, `docs/master-plan.md`, and `docs/bad-smell.md`. The sole the reference reference is the reference implementation.

## 1. Current snapshot

| Item | Status |
|---|---:|
| Canonical A-E cards | 888 |
| Canonical OA A-E card definitions | 888 |
| Literal mismatches from the automated metadata audit | 0 |
| Complex mismatches from the automated metadata audit | 4 |
| Accepted schema-up differences among those mismatches | 4 |
| Cards requiring implementation review | 0 |
| Accepted or product-policy differences | 70 |
| Excluded legacy sources or non-target behavior | 3 |
| Cards treated as aligned by this audit | 815 |
| Structured Parent Card definitions | 24 / 24 |
| Parent Cards gameplay | Setup, simultaneous selection, optional direct deal, mother rewards through future meeples, fractional scoring, ordinary-card draw-and-keep UI, typed father requirements, and simple or complex side quests are implemented |
| Six-player Major Improvement supply and behavior | Ten standard cards plus eight duplicate concrete IDs; stack-aware supply exposes only each stack top in six-player games, while two-to-five-player games keep the standard flat supply |
| Through the Seasons gameplay | Random starting season, four public seasonal spaces, next-round season changes, seasonal setup changes, actions, and discounts are implemented |
| Farmers of the Moor complexity III gameplay | Variant setup, terrain, special actions, heating, fuel, sick workers, Infirmary, horses, Horse Market, breeding, reorganization, scoring, major-supply stacks, staged hand setup, UI and protocol integration, compatibility coverage, ten FoM Major Improvements, and all 117 FoM minor improvements from M015 through M131 are implemented |

Printed `STABLE` costs and `passing` are aligned. All literal metadata matches. The four complex mismatches are accepted schema-up prerequisite differences.

Parent Cards include PR01-PR12 and PS01-PS12 data and assets, registry validation, optional setup, simultaneous mother and father selection, direct dealing through `draftParents=false`, restart-safe Room settings, mother scheduling through `state.futureMeeples` and `receive`, public `parent.motherScheduled` events, stable player-name synchronization, fractional `parentCards` scoring, ordinary occupation and minor draw decks, private draw-three-keep-one choices, and father side-quest completion and rewards. Selection and draw decks use a private seed rather than public `gameSeed`; ordinary and anytime actions are blocked while a keep-one choice is pending. Typed father requirements cover PS03, PS04, PS06, and PS08, while complex rewards retain explicit draw, choice, or sow flows. Parent Cards remain outside A-E Card Sources, the cards manifest, ordinary hands, and the regular card registry. Adoption is not implemented.

The audit prioritizes printed and custom descriptions, cost, prerequisites, passing, occupation or minor metadata, and game behavior. Upstream platform fields such as `banned`, `implemented`, `isCorbariusOrDulcinaria`, and `isArtifexOrBubulcus` are not alignment requirements; product-policy effects are recorded as accepted differences or exclusions rather than implementation bugs.

## 2. Open issues by priority

The reference PHP path is relative by defaultthe reference implementation;The OA path is relative to this warehouse by default.

There are currently no open issue priority entries.

## 3. Accepted differences

Unless the product direction changes, the following is not considered a current bug.

2026-05-25 After retrial, the old`docs/card_progress.md`The "accepted simplification/deliberate behavior difference" of §5/§6 is no longer accepted as a basis; the relevant cards have been relisted as §2/§11, or changed to Aligned after review.

|category|cards|
|---|---|
|Use schema-up metadata instead of the reference custom`isBuyable` | `A003_PaperKnife`, `B056_Brook`, `B074_ThickForest`, `B154_SheepKeeper` |
|field/cardField crop constraint difference| `E070_CropRotationField` |
|the reference is not implemented, but OA has product extensions/rewrites| `A113_HeresyTeacher`, `A169_OffSiter`, `A170_Hayward`, `A171_Sidekick`, `A173_ClayThief`, `A174_MasterHora`, `A177_Middleman`, `A180_AnimalBrander`, `B170_CorralBuilder`, `B171_GreenhouseBuilder`, `B173_Sweeper`, `B175_FieldOverseer`, `B176_VillageIdiot`, `B178_TagAlong`, `B179_WildBoarHunter`, `C169_FastMason`, `C170_AmateurFencer`, `C171_YoungArtist`, `C172_FieldCounter`, `C173_TopOuter`, `C175_VillageTeacher`, `C180_Trapper`, `D025_WitchesDanceFloor`, `D170_FoldBuilder`, `D171_SeniorTeacher`, `D173_TownClerk`, `D175_Countryman`, `D176_Woodshacker`, `D178_SubstituteTeacher`, `D179_Bullcatcher`, `D180_PartTimeWorker` |
|the reference banned, but OA retained| `A131_CraftTeacher`, `A133_Braggart`, `A014_CarpentersHammer`, `A033_BigCountry`, `A039_Chapel`, `A048_ShavingHorse`, `A082_WorkCertificate`, `A097_Freshman`, `B010_Caravan`, `B117_Informant`, `B132_EstateMaster`, `B151_LittlePeasant`, `B015_CarpentersBench`, `B161_Weakling`, `B021_HayloftBarn`, `B022_WalkingBoots`, `C102_TreeGuard`, `C125_Nightworker`, `C028_TeachersDesk`, `C031_WritingChamber`, `C003_CarriageTrip`, `C060_SmallPottersOven`, `C063_CraftBrewery`, `C099_GardenDesigner`, `D137_TradeTeacher`, `D019_PulverizerPlow`, `D021_Recruitment`, `D033_SummerHouse`, `D004_CrossCutWood`, `D074_RoyalWood`, `D092_ChildOmbudsman`, `D097_BeggingStudent`, `E022_GuestRoom` |
|the reference stable / FarmHand model differences| `B085_FarmHand` |
|Candidate Closure: The optional branch candidate set is a legal superset of the the reference single topo sequence product; after the solver layer controls pruning (ADR 0004 Amendment), the player optional set is consistent with the the reference optimal set, and the single option auto-resolve; the virtual payment resources provided by the card are entered with its own key`resourcesPaid`, and the player's inventory resources do not dominate each other|All card-purchase / unit-trade cost Modify card; B155 this type of action grid payment resources|
|Candidate Closure: Equivalent candidate rows (same as resources + originalFeeIndex, only different in sources) only retain one representative row (sources least → key lexicographic order, ADR 0004 Amendment); players no longer see the repeated payment option with only different attribution, and cards with unselected chains do not enter this option hover attribution|All card-purchase cost modification cards (C95/E109 fixed-price twin, A75/D117 bypass chain, etc.)|

## 4. Simplicity review

The number of lines is just a signal, not a conclusion. Review scope: Count non-empty and non-comment lines based on the current Card Source file and canonical the reference PHP file; method/function declaration lines are retained. Only exclude OA`import` / `export`OK, and the reference's`<?php` / `namespace` / `use`OK.

To compare simplicity, we must first eliminate the bad taste of the reference: if the reference passes`Actions/*`, `Core/*`, `Models/*`Wait for the main path, or an explicit cardId branch in other card files to compensate for the behavior of a certain card. This card does not enter the simplicity comparison. The reference`implemented=false`There is no comparable implementation for the card, so it is skipped and not listed in this section.

After excluding the reference bad taste and unrealized items, there are currently 7 cards with OA/the reference > 1.5 that can be compared fairly:

|cards| the reference | OA |Proportion|Reason/Follow-up Judgment|
|---|---:|---:|---:|---|
| `B093_Confidant` | 59 | 132 | 2.24 |For the reference`FOODPLUS` future meeple + `getPostReceiveBonus()`Implicitly string together the sow/fence after returning food; OA also explicitly handles the professional payment`reserveResources`, lessons doability, future meeple resolved provenance, anti-duplication`lastResolvedRound`, and 1 wood fence policy. It can be simplified after future meeple supports post-receive bonus.|
| `C150_ParrotBreeder` | 67 | 147 | 2.19 |the reference directly reads the seat/actionCardId, and uses flag + extraData + dummy playerConstraint to inject the occupied action grid; OA needs to explicitly track the right neighbor, pay the grain flag at any time, clean up after releasing oneself/opponent, and then`place-farmer`Inject occupied option. A complete single-card state machine, no general helpers are available for the time being.|
| `C094_StableCleaner` | 42 | 78 | 1.86 |the reference directly returns fixed-cost`STABLES`flow; OA requires probe before exposing anytime`stables`cost modifier / affordability, and explicitly package flag,`trueAction:false`, fixed cost context and post-execution cleanup. If the anytime action can be integrated with the built-in affordability probe, it can be further reduced.|
| `B157_Salter` | 104 | 177 | 1.70 |the reference's`payNode` / `argsSalt` / `actSalt`Responsible for animal selection and payment; OA needs to be customized`resource-quantity-select`ad-hoc action, verify that the animal must come from the farm and reserve is empty, deduct animals from the board, single animal shortcut, future food schedule and log. The the reference itself is also long and has low priority.|
| `A130_MummysBoy` | 53 | 90 | 1.70 |the reference dependency`Globals::getPlacedFarmers()` / `Farmers`The manager directly finds the second farmer position and injects the dummy action; OA needs to be implemented explicitly with placement order, occupied-space option, meeting-place filtering, once-per-round flag and start-turn cleanup. Similar to C150, unless the occupied action helper is drawn, the card remains in a closed loop.|
| `B156_StorehouseKeeper` | 29 | 44 | 1.52 |For the reference`isActionCardEvent('ResourceMarket')` + `gainNode`XOR; OA needs to explicitly list the resource-market variant and include listener / typed flow. Low boundary item, only worth pumping the helper if more action-space alias cards appear.|
| `B107_Manservant` | 33 | 50 | 1.52 |the reference's`onBuy`Reuse`onPlayerAfterRenovation()`and return directly`futureMeeplesNode`;OA needs to be reused`placeFood`, after-renovation listener, stone-house guard, `queueFutureMeeples`+ node bridge. Low boundary items, low priority.|

Cards excluded due to the reference bad taste:

|cards|Troubleshooting causes|
|---|---|
| `D036_BreedRegistry` |the reference in`Core/the reference`Update infobox for this card.|
| `E161_ElderBaker` |the reference in`ActionCards.js`and`Actions/the reference`Make a special judgment on the main path of this card.|
| `C088_CarpentersApprentice` |the reference in`Actions/the reference`and`Actions/the reference`Make a special judgment on the main path of this card.|
| `A041_VegetableSlicer` |the reference in`Actions/the reference`Make a special decision on the payment route for this card.|
| `A087_Conservator` |the reference in`Actions/the reference`Make a special judgment on the renovation path of this card.|
| `D131_CraftsmanshipPromoter` |the reference in`Actions/the reference`Make a special judgment on the main path of this card.|
| `D001_ZigzagHarrow` |the reference in`Models/the reference`Provides a special geometry helper for this card.|
| `E016_BriarHedge` |the reference in`Actions/the reference`Make a special judgment on the fence path for this card.|
| `B138_ForestGuardian` | the referenceOther card paths explicitly enumerate this card.|
| `C016_FieldFences` |the reference in`Actions/the reference`Make a special judgment on the fence path for this card.|
| `C027_Blueprint` |the reference in`Actions/the reference`Make a special judgment on the main path of this card.|
| `B146_Illusionist` | the referenceOther card paths explicitly enumerate this card.|
| `B042_ForestInn` | the referenceOther card paths explicitly enumerate this card.|
| `C162_ForestOwner` | the referenceOther card paths explicitly determine this card.|
| `A106_SlurrySpreader` |the reference in`Actions/the reference`Make a special judgment on the harvest path of this card.|
| `D132_HideFarmer` |the reference in`Managers/the reference`Make a special judgment on the scoring path for this card.|
| `E096_Elder` |the reference in`States/the reference`Make a special turn path judgment on this card.|
| `E155_Visionary` |the reference in`Actions/the reference`andthe referenceMake a special judgment on this card.|
| `E153_StoneSculptor` | the referenceOther card paths explicitly enumerate this card.|

Recent PR / Old high-proportion items that have been reduced after this round of simplification:

|cards|change|
|---|---|
| `A111_WallBuilder` |This round is changed to after construct and returns directly to inline.`futureMeeplesNode`, remove the built-room delta, action snapshot token and extraData in the card to prevent redundancy; according to the current review caliber, it is lower than 1.5.|
| `B018_GrasslandHarrow` |This round allows future meeple to support`field`/`stable`The action is triggered upon expiration; B18 only retains the after-pay calculation target round.`field`future meeple, remove from the card`targetRound` / `onRoundStart`State machine.|
| `E118_KindlingGatherer` |This round of mergers`place-farmer` / `collect` / `gain`Three listeners with the same handler, retaining action-space provenance filtering.|
| `E148_Lazybones` |Draw this round`action-space-tokens`Helper, unifies bounded token choice, choice resolve, owner-targeted token consume flow; only trigger space, open space judgment and helper call are retained in the E148 card, which is reduced to the reference 65 / OA 66 = 1.02 according to the current review caliber.|
| `C041_FarmStore` |#244 Use the card later`REWARD_OPTIONS`Table generation optional pay/gain XOR.|
| `D080_BrickHammer` |#244 Go behind`getPrintedImprovementResourceCost()`, no more hand-written cost / altCosts branches.|
| `E142_Smuggler` |#244 After`TRADE_OPTIONS`Table generates homogeneous 2x options and retains mixed optional OR.|
| `E156_ClaypitOwner` |#244 Post printed/base cost helper covers minor altCosts and major fee candidates.|
| `D117_WoodExpert` |#259/#272 After deriving candidates from the current Cost Candidate List, it has fallen below the 1.5 threshold.|

Subsequent simplification principle: Only when the same helper can serve at least two current or recent target cards, a new abstraction will be drawn; otherwise, the closed loop within the card will be maintained.

## 5. Architecture review

This review found no new "front-end only adjudication rules" path, nor an open common infrastructure blocker. The following table only retains architectural matters that will continue to constrain new cards/subsequent changes; completed one-time infrastructure records are no longer retained as to-dos.

|matter|Current code evidence|Subsequent constraints|
|---|---|---|
|Metadata audit coverage needs to be synchronized with field evolution|`STABLE` cost and `passing` are covered; current literal mismatch is 0|When adding metadata fields, add the matching fixture at the same time to avoid statistical caliber rollback.|
|Backend authoritative action/pending contract| `allowedCommands`, typed request, `commitSelection`, `engine-resolve` protected cancel, `resolveEngineChoice`, bare improvement choice ids |New interactions must explicitly expose command/options and be verified by the backend; major/minor improvement choice value uses bare`cardId`,old`major:` / `minor:`Only available as parser compatible input, paid option reserved`pay:*`namespace; do not restore encoded choice shortcut, old pending cursor, or front-end arbitration rules.|
|Events & Payments provenance| `resource.paid`, `paymentSources`, `sumActualPaidResource()`, `bonusChoiceIndex`, `event-mapping-policy.ts`, `publicEventArchive`, `shared/actions/helpers/trades.ts`, `shared/actions/helpers/trade-applied-listener.ts`, `shared/cards/__tests__/provenance-result-audit.test.ts` |Payment / resources / farm metadata emit structured events first, and then let the listener consume them; do not produce cards from`context.result`Read resource facts. Animal exchange must be deducted through the exchange/trade path. By default, animals have been placed in pasture/house/stable/animal-holder to avoid changing only`player.resources`Leave the phantom animal behind. Cards that require per-trade pre-resource thresholds are monitored first`immediatelyAfter.trade-applied`, read`extraData.preResources`. |
| Cost Attribution / hover stats | `CardResourceStats`, `trackSourceCardPaymentStats`, `recordCardCostAttribution()`, `recordActionCostAttribution()`, `collectFarmChoiceCostAdjustments()`, ADR 0003 |The saved / paid display of cost change cards must go through Cost Attribution; card-purchase selected candidate writes each source card's own saved / paid delta; construct / fencing / stables / plow action`computeCosts`The attribution must be explicitly declared, and the statistics will be written by the host action according to the actual before / after delta and clamp; the farm-choice commit must retain the payload-aware attribution. Don’t carry it because of pay leaf`sourceCard`The entire action/card-purchase payment will be recorded as the PAID of the card.|
| Printed improvement base cost helper | `getPrintedImprovementResourceCost()`, D80/E156 |Read printed/base cost candidates of minor/major definitions;`cost`, minor `altCosts`, major complex `fee` / `fees`Is the candidate group, taking the maximum value according to the target resource, not based on the actual payment or candidate sum.|
| Card-purchase ComputeCardCosts candidate pipeline | `resolveCardCostWithModifiersDetailed()`, `deriveCardCostCandidate` + `cardCostCandidateMandatory`, `CardImpl.getBaseCosts()`, `PaymentSolver.discountCardCostCandidate()`, ADR 0003, ADR 0004 |The new cost variant of purchasing major/minor improvement goes through the Cost Candidate List; dynamic basic costs such as A20/B36 produce base candidates before the pipeline; the card only declares a single candidate transformation, and the traversal/deduplication/saturation filtering is handled by the candidate closure (`CardListenerRegistration.order`Deleted, reintroduction of the order field is prohibited); ordinary discounts naturally retain the original candidates, and subsequent payment dominance will hide the strictly disadvantaged payment items;`cardCostCandidateMandatory`Only used for fixed price/replacement products where the semantics of the original candidate must be hidden (such as A27), and cannot be used for ordinary discounts such as A75; resource keys folded to 0 are omitted; candidate metadata is not written to the resource map or general`PaymentSolution`, merged into existing by PaymentSolver payment receipt`sourceCards`, and write the Cost Attribution to Card Resource Stats after the payment is selected; the production card passes`PaymentSolver`Use candidate helper instead of direct import`payment/internal/*`. |
|FoM cross-player marker/card passing minor improvements| `publicCardMarkers` helper, `pass-minor-card-to-left` internal action, `card.passed` provenance, FarmBoard player summary marker |Cross-player public marker writes to target player`cardStates[sourceCard].extraData.publicCardMarkers`, score entry`cardBonusVp`, the UI only expands the summary display of the original player; when passing cards, you must use internal action to remove the original playing area and cardState, give the target player private handChanged, and use`card.passed`The event triggers subsequent listeners.|
| Payment resource removal / bonus choices / unit cost alternatives | `CostResourceRemovalModifier`, `Bonus.capDiscountAtCost`, `Bonus.trackChoiceIndex`, `Bonus.choiceAffectsState`, C14, A16, C56, D88 |"A cost resource is no longer needed" is changed from`fee` / `fees` / `unitFee`Delete the resource key and maintain the deletion constraint after each post-bonus. It cannot be simulated with an arbitrarily large capped discount; the actual reduction is written`PaymentSolution.bonusReductions`For Cost Attribution. Ordinary bonus choice must not generate negative cost after discount, typed cost payment is not retained`resourcesPaid`Negative surplus branch. The reference`addCost`per-unit alternative Use first`scope:'unit'`The trade generates a cost row, and then allows bonus choices such as D88 to continue to be replaced.`bonusChoiceIndex`It only indicates which choice the player has chosen; only`choiceAffectsState`Payment dominance prohibits mutual cutting only when the marked choice identity will be consumed by listeners such as after-pay and changes state. This flag is not set for stateless replacement choices such as B145/D88.|
| Card-provided payment resources | `ComplexCost.paymentResourceProviders`, `PaymentSolution.paymentResourceCovers`, `B155_ArtTeacher`, ADR 0004 |Cards are available at`computeCosts`Declare payment-only virtual resources within the card; provider defines the available amount, coverage ratio and consumption source inside the card. The virtual resource does not enter the cost candidate line or`PlayerState.resources`, but will appear in payment option /`resourcesPaid`;To use the payment option of provider, you must put the provider`sourceCard`Merge`sourceCards`To distinguish the card effect path, and consume the source status by the executor.|
| Payment budgets | `ComplexCost.paymentBudget`, `fencePolicy.paymentBudget`, `B015_CarpentersBench` |to the end`PaymentSolution.resourcesPaid`Perform resource upper limit filtering; do not provide resources, do not change cost row, and do nothing.`segmentBounds`. The "only use this resource" rules used in fencing such as B15 must be checked after free fence / computeCosts / payment solver, and are prohibited from being replaced by the upper limit of the number of collected+1 segments.|
|Candidate Closure (candidate closure, ADR 0004)| `candidate-closure.ts` `closeCandidates()`, `buildUnitCostOptions()`closure access,`cost-modifier-permutation-probe.test.ts` |unit trade (D15/B145/A123, etc.) is no longer declared`order`, `Trade.order` / `TradeModifier.order`Deleted; the reachable cost row set is generated by closure seeking fixed points and has nothing to do with the modifier registration order; mandatory saturation filtering ensures that the forced discount chain converges in any order; the new cost transformation only declares local semantics (what to replace, mandatory or not, maxUses) and prohibits the reintroduction of any order fields.|
| Action reaction listener dispatch | `CardListenerRegistration`, `buildPhaseTrailingNodes()`, `resolveTriggerSelectChild()`, `canPreviewPureResourceFlow()` | `before` / `during` / `immediatelyAfter` / `after`Reaction listener enters according to the reference reaction semantics by default under the same owner / phase`trigger-select`, the same timing reaction of different owners is split into the activation/prompt of their respective owners. Single-card opt-in is no longer required, and per-card serial escape hatch is not retained; a single child can be directly expanded to reduce UI noise. The compute/query listener continues serial aggregation without generating player selections. The pure resource preview of trigger-select checks the common resources and fence/stable supply token according to the child owner / target player. The option defaults to the card id.`value`,repeat`sourceCard`Use activation node id instead,`sourceCard`Keep the displayed card id, and keep the host action in pending`targetSpaceId`;No`cardIds`Let's rely on`context.sourceCard`The guard's global listener will inherit this event`sourceCard`Return as activation card id;`void`But write this card on preview clone`cardStates`The mutation-only listener is also considered applicable/doable, and the actual mutation will only be implemented after the player selects it. pass gate is determined based on the actual result after preview, explicit mandatory or enabled non-before non-optional result disabled pass, root`flow.optional === true`Allow pass,`before`The trigger continues to be determined based on the original action continuation; pure resource flows use preview and post-resource check continuation, and non-resource flows will also use the current resource context to ask for continuation reachability to avoid scoped situations such as D17 / C60.`isDoable`The unlocker is skipped by pass; the optional root payment can be disabled due to insufficient resources, and the nested optional can still be retained as a skippable sub-process; the child whose structure is not applicable is not permanently resolved, and will be re-evaluated after subsequent sibling changes state.|
|Stage CardEffect reaction dispatch| `stageResume`, `confirm-player-switch`, `activate-card-effect`, `previewActivateCardEffect()`, `continueStageReactionHook()`, `onBeforeEndGame`, `beforeEndGameScope` |Harvest field three stages hook and before-end target-player step pass`activate-card-effect`child enter`ParallelNode(mode='trigger-select')`, there is no need for before-end single-card opt-in, nor is it necessary to separate and sort harvest field automatic flow and interactive flow; trigger-select preview uses the cloned state/player of the activation target, flow-returning and direct-mutation void handler can be used as applicable activation. The real mutation will only be implemented after the player selects activation, and unapplied activation will be re-evaluated after the sibling of the same layer is executed. before-end no-flow direct-mutation activation still obeys`beforeEndGameMandatory:false`, pass will not be forcibly disabled due to the existence of clone mutation.`beforeEndGameScope`Still expresses owner/allPlayers target semantics; other direct stage hooks that have not been moved into the reaction dispatcher temporarily maintain the serial scanning gap.|
| Extra-turn provider selection | `collectExtraTurnContributions()`, `collectExtraTurnFlow()`, `activate-extra-turn`, `ParallelNode.resolveAfterSelection`, `XorNode.selectedChildId`, `_extraTurnSkipCountsByCard` / `_extraTurnConsumedCountsByCard` |When multiple cards contribute turn-rotation extra action at the same time, use one-shot first`ParallelNode(mode='trigger-select')`Show provider activation; trigger-select child but`activate-extra-turn`This kind of non-`activate-card`internal action, select it to expand the card's own flow. Nested provider after expansion`xor(seq(...))`The selected branch will be recorded and completely drained to avoid completing the process ahead of schedule after only executing the first step of pay. Single providers are still expanded directly to reduce UI noise. skip-turn / forced consume no longer uses player-level global counter, but writes per-source skip/consume count according to cardId; only non-interaction skip fallback uses stable card order to consume a source. During actual activation, if the provider no longer contributes to the flow, it will fail instead of silently consuming the provider prompt.|
|Stage hook recovery with mutable played-card list| `stageResume.extra.resumeAfterCardId`, `resolveStageStartCardIndex()` |If the stage hook sub-process will remove the current card, the resume cannot only rely on the old numeric index; it must be restored according to the previous card id. When the card has been removed, it will continue from the previous index of the old index to avoid skipping subsequent cards in the same stage.|
|Endgame scoring and card bonus VP unified model| `shared/domain/scoring.ts`, `scoring-reserve.ts`, `ScoreEntry.type='bonus'`, `cardBonusVp`category, ScoringPad / compact score test|Bonus points for all non-printed cards entered`cardBonusVp`;Do not read or be compatible with old`cardsBonus` / `cardStateBonusVp` / `cardBonus`score key. Scoring Reserve only takes up final scoring resources and does not deduct real resources.|
|Card ability metadata and implementation boundaries| `CardDefinition` runtime capability fields, `playerHasCardCapability()`, `getPlayedCardDefinitions()`, `collectCardDefinitionsAs()`, `pnpm run check:card-impl-boundaries` |Cross-card identity/capability reading metadata/helper; production`shared/cards/A-E/M/*.ts`No new runtime wildcard id branch will be added. The target card with a clear name on the card surface can be used as a named printed target for public existence/owner/whether it has been printed, but the target ID must be in`reaches`or equivalent declarative metadata, and must not read the target card's private implementation state or bypass it with a coarse-grained allowlist.`ovenIdentity`In OA, it is oven-family identity, including upgrade/minor such as Oven Installation. M072 is scored according to this metadata; upgrade cards are available`firewoodBuildTrigger:false`Retains scoring identity but does not trigger C075 Firewood.|
|Custom card runtime / frontend metadata split| `shared/cards/custom-registry.ts`, `shared/cards/custom-card-metadata.ts`, `shared/contract/cards.ts`, `client/services/card-meta.ts`, `client/components/common/PlayerCard.tsx`, `server/workshop-pr/code-gen.ts`, `scripts/build-cards-manifest.ts`, `scripts/__tests__/eslint-client-boundary.test.ts` |The server/sandbox only registers impl, session context, effects, listeners, and modifiers; the main client only registers display metadata, art URL, and O number, and does not import custom runtime registry. When publishing in the workshop, write the actual image extension into Card Source`meta.artUrl`, the static manifest is reserved`artUrl` / `locales`;Customized card images at runtime will continue to go to the API URL, and published community card images will go to the front end`BASE_URL`, the name, description and preconditions fall back to the global i18n → card-local locale → basic metadata.|
|Custom card listener action whitelist| `sandbox-listener-actions.ts`, `ast-validator.ts`, `llmPrompts.ts`, `check-prompt-sync.ts` |Workshop prompt, AST validator, server/browser manifest and document synchronization check share the same action list; unknown or deleted actions explicitly fail when saving, and listeners that can be compiled but never fire are no longer generated.|
|Workshop executable semantic contract| `CustomCodeEffectMetadata.handHooks`, `HELPERS_INJECTION_SOURCE`, `cardEffectHooks`, `listener-result-validator.ts`, `format-cost-exact-audit.test.ts`, `workshop-cost-prompt-contract.test.ts`, LLM fixture M11 |The server/browser manifest only retains those that can be dispatched from hand.`handHooks`, not supported`onBeforeEndGame`; AST requires effect to use object literals directly, prohibiting variable references/spread/computed key/accessor to bypass hook/meta verification. The two manifest extractors will also reuse the same predicate filter on the host side; farm locations are used uniformly`{row,col}` / `row-col`; Candidate/settlement hook pairs that rely on host mutations do not enter the JSON snapshot sandbox whitelist;`onComputeAnimalZones`Only newly added areas are returned. listener returns`costs`Must also return matching`costAttribution`, Workshop AST and runtime validator double verification, formal card static access control rejects those that cannot be checked`computeCosts`Returns; resource discount usage across all major/minor improvement candidates`capDiscountAtCost:true`, `optional:false`, `sources:[CARD_ID]`bonus,`costs`Only used for simple action costs; prompt changes must pass semantic contract testing, live fixtures, record and golden replay in order.|
|Server-side Workshop session isolation| `server/game/custom-session-executor.ts`, `custom-session-worker.ts`, `game-router.ts`, `connection/room-router.ts` |The executable Workshop card that has not yet been built in puts the complete command into an independent Worker according to HTTP session / WS room. The room FIFO covers Durable Commit, and the room change / seat change of the same connection is waiting for the command in transit; hook timeout/runtime warning checkspoint before restoring the command containing pending/undo history and retains the diagnosis. Process-level 15-slot unified calculation of Worker reservations for WS Room, recovery Room, and HTTP sandbox;`built_in=1`The card still directly uses the built-in implementation and does not create a Worker, and the browser's local sandbox remains unchanged.|
|Card Source metadata / runtime separation| `shared/cards/card-source.ts`, `scripts/build-cards-manifest.ts`, `scripts/generate-register-all.ts`, `scripts/check-generated-cards-sync.ts`, `shared/cards/__tests__/card-source-representatives.test.ts`, `client/components/common/PlayerCard.tsx` |Card Source The runtime field of the card is only placed in`impl`;manifest/generated catalog is only read statically`meta`And output the metadata literal;`definePlayerActionCard`Must be explicitly declared`playerActionCardType`, the card dealer pool and UI distinguish occupation / minor by this field, do not guess from the card number or i18n; PlayerCard reads the manifest and renders non-0 printed positive/negative VP, and does not misjudge negative VP as missing metadata; major runtime source only in`major/runtime.generated.ts`Enter the backend implementation path; the generated catalog must be kept in sync; the workshop PR generation must be based on the fetched upstream generated file patch, and the local cards tree of the deployment machine is not read; the representative card must be overwritten through the production catalog / registry path.|
| Major Improvement stack supply / duplicate / variant behavior | `shared/cards/major/supply.ts`, `GameState.majorImprovementSupply`, `availableMajorImprovements`, `MajorImprovements` panel, `shared/cards/major/*`, `exchange-registry.ts`, `bake-exchange-ui.ts`, `anytime-exchange-ui.ts` |Major supply is templated by variant registry selection; 6 duplicate majors and Farmers of the Moor major supply are real card id stacks, and board availability only exposes the current top of each stack. major purchase / return-to-board / swap must pass the supply helper to synchronize stack and compatible flat list; production code reading is visible / can be purchased major must also pass the supply query helper, and is prohibited from being scattered on the main path`availableMajorImprovements`push/filter/includes to express supply changes or visibility. duplicate Well/oven/cookery/workshop behavior must keep concrete id as`sourceCard`/ exchange source / scoring attribution, no alias is needed to disguise it as the original version; when FoM is enabled, use 12 supply slots, 14 FoM major + 10 basic cards, do not add 5/6 duplicate majors, and return to Fireplace / Cooking Hearth according to the stackId of the current situation to return to the original FoM supply slot. FoM major definitions are organized according to the single card/card family files of the original major, and runtime effects take priority with card metadata/impl:`requiresFarmersOfTheMoor`Gated exclusive exchange,`heatingRoomDiscount` / `heatingFuelCap`To drive heating demand, onBuy/onHarvest uses standard ActionFlow to avoid writing single card branches in the main paths of heating, exchange, and harvest. The client exchange center builds bake / anytime display lines from manifest metadata, and only puts the backend`exchange`The executable trade index encoding in choice returns`bulk:`;The enforceability of rules still depends on the backend.|
| PaymentSolver production/test entrypoint | `PaymentSolver.resolvePayment()`, `PaymentSolver.hasPaymentOption()`, `CardPurchasePayment`, `shared/actions/payment/card-purchase.ts`, `PaymentSolver.resolveTypedFlatPaymentSelection()`, `payAction`, `shared/actions/payment/__tests__/test-helpers.ts`, `shared/actions/payment/__tests__/import-boundary.test.ts` |Production pay leaf, preview-cost, typed-flat, room payment, simple resource/trade side effect, card cost candidate helper all pass`PaymentSolver`facade; major/minor improvement purchased preview metadata, payment option prefix, returned-card scope and receipt to`PaymentInfo`The conversion is focused on`CardPurchasePayment`. External testing uses`PaymentSolver`, `CardPurchasePayment`or payment test helper, only`shared/actions/payment/internal/__tests__`Keep algorithm white-box testing;`payment/internal/*`It is only used for payment package internal and algorithm-focused tests. Boundary testing prohibits direct import of production code and non-payment internal tests. The front-end wait protocol and option value prefix/index semantics remain unchanged;`resource.paid`Events and return major supply are still handled by the effect/session layer, and card-purchase candidate stats are handled by`CardPurchasePayment`/ pay leaf is written from receipt attribution.|
| Improvement purchase lifecycle | `shared/actions/helpers/improvement-purchase-lifecycle.ts`, `shared/actions/effects/improvement.ts`, `CardPurchasePayment`, `activate-card-effect` |major/minor improvement purchased payment preview / option / receipt still by`CardPurchasePayment`Responsible for; status submission after successful payment, returned card, minor passing,`improvementPayment` extraData, `card.played` / `card.passed`event, private hand change event focus on improvement purchase lifecycle helper. public action paths still obey`pay` child → host commit → after-host-commit `onBuy`; direct play path reuses the same commit helper and then executes it`onBuy`. Do not put business mutations back`pay`, and do not restore`apply-improvement`effect or`PlayerState` payment scratchpad. |
|Parent Card Definition data boundaries| `shared/parents/*`, `public-assets.ref`, `public-assets.required.json`, `client/services/parent-assets.ts`, `client/app/parents/*`, `shared/parents/__tests__/parent-cards-complete.test.ts`, `shared/parents/selection.ts`, `shared/parents/mother-rewards.ts`, `shared/parents/father-completion.ts`, `shared/session/ordinary-card-draw.ts`, `shared/domain/scoring.ts` |Parent Cards are extension-specific structured data and runtime asset references that do not belong to the A-E Card Source / Card Definition / Card Impl projection; portrait / back through`publicAssetUrl()`read`public-assets.ref`External resources declared by the required list under the fixed commit will not retain a copy of the image in the main repository; setup / simultaneous mother+father selection, optional direct deal and room reopening mode persistence, automatic submission of the only mother/father backend, and mother round gain are queued into real`state.futureMeeples`And when direct deal / simultaneous draft finalize, the current round reward and opening mother schedule log are settled.`parent.motherScheduled`public event is derived and stable through`playerId`Follow WS seat display name, ActionBoard round slot future token,`parentCards`scoring, father typed requirement variants (PS03/PS04/PS06/PS08), father simple/complex side quest completion, reward, draw keep-one transport + UI, ordinary draw pending action gate, sow completion marker, father resource choice structured preview, PS06/PS08 simple resource reward runtime coverage has been accessed by the backend authority; father reward manual keys are still reserved as complex reward schema-up residual scope; candidate and ordinary draw decks must use non-public seed, do not make up for the rules at the front end.|
|Through the Seasons variant boundaries| `shared/seasons/*`, `createSeasonActionSpaces()`, `registerThroughTheSeasonsHooks()`, `registerThroughTheSeasonsCardListeners()`, `server/__tests__/through-the-seasons-*-session.test.ts` |Through the Seasons is a Game Variant, not a source of cards; the Four Seasons Action Grid is a permanent public board, only`state.throughTheSeasons.currentSeason`The corresponding action slot is executable, and the season advances at the beginning of the next round with setup adjustments applied. Seasonal layout actions go through the backend ActionFlow; common action modifications such as Winter/Spring/Summer go through action hooks, and seasonal action branches must reuse flow child doability to include hook/listener executability; Summer Day Laborer extra grains are limited to one action per action with action snapshot tokens; Autumn major-improvement enforces building resource discounts through session-level global card-purchase candidate listener and is controlled by`cardCostCandidateMandatory`Hide undiscounted candidates; variant listener does not write players`cardStates`, do not add rules on the front end.|
|Farmers of the Moor hand setup / draft border| `shared/session/state-bootstrap.ts`, `shared/draft/draft-manager.ts`, `shared/draft/types.ts`, `server/game/__tests__/draft-session.test.ts`, `shared/session/__tests__/farmers-of-the-moor-setup.test.ts` |Farmers of the Moor's small improvement source is independent from the published ordinary small improvement card pool; the FoM can be issued. When the small improvement is insufficient, the start will be refused by default, and only the room option is available.`allowIncompleteFarmersOfTheMoorMinorDeal`Only when turned on will the amount be reduced to 0. Non-draft will issue 4 FoM minor improvements (if insufficient, reduce by the same amount according to the option) + 3 published minor improvements; simultaneous draft will implement professional, FoM minor improvements, and published minor improvements in stages. Only the corresponding card type will be submitted at the current stage. Community Deck / custom minor only enters the published minor improvement part; Parent Cards selection is still started after the hand is determined, and does not enter the FoM card source. The current FoM small improvement pool that can be issued only contains 117 implemented pictures:`M015` / `M016` / `M017` / `M018` / `M019` / `M020` / `M021` / `M022` / `M023` / `M024` / `M025` / `M026` / `M027` / `M028` / `M029` / `M030` / `M031` / `M032` / `M033` / `M034` / `M035` / `M036` / `M037` / `M038` / `M039` / `M040` / `M041` / `M042` / `M043` / `M044` / `M045` / `M046` / `M047` / `M048` / `M049` / `M050` / `M051` / `M052` / `M053` / `M054` / `M055` / `M056` / `M057` / `M058` / `M059` / `M060` / `M061` / `M062` / `M063` / `M064` / `M065` / `M066` / `M067` / `M068` / `M069` / `M070` / `M071` / `M072` / `M073` / `M074` / `M075` / `M076` / `M077` / `M078` / `M079` / `M080` / `M081` / `M082` / `M083` / `M084` / `M085` / `M086` / `M087` / `M088` / `M089` / `M090` / `M091` / `M092` / `M093` / `M094` / `M095` / `M096` / `M097` / `M098` / `M099` / `M100` / `M101` / `M102` / `M103` / `M104` / `M105` / `M106` / `M107` / `M108` / `M109` / `M110` / `M111` / `M112` / `M113` / `M114` / `M115` / `M116` / `M117` / `M118` / `M119` / `M120` / `M121` / `M122` / `M123` / `M124` / `M125` / `M126` / `M127` / `M128` / `M129` / `M130` / `M131`. |
|Farmers of the Moor small improved dealing pool derivation| `getImplementedFarmersOfTheMoorMinorIds()`, `implementedMinorImprovementCards`, `CardDefinition.requiresFarmersOfTheMoor`, `cardAllowedForPlayerCount()` |The current FoM small improvement pool that can be issued is dynamically derived from the implemented registry, and only the FoM exclusive small improvements and cards available to the current number of people are screened;`state-bootstrap`A list of handwritten IDs parallel to the card registry is no longer maintained.|
| Card description icon rendering | `shared/cards/{A,B,C,D,E,M,major,community}/*.ts`, `shared/parents/cards/*.ts`, `shared/i18n/{en,zh}.ts`, `client/components/common/ResourceText.tsx`, `client/components/common/PlayerCard.tsx`, `scripts/__tests__/card-description-icons.test.ts`, `scripts/__tests__/card-description-double-underscore.test.ts` |The resources, animals, terrain, stables, fences, fields and bonus points used in the production card description`ResourceText`token renders icons; fast-scripts access control will scan all production card descriptions to prevent iconized words from falling back to plain text.`__...__`Only used for precise card name, action name, and action slot name references, not quantities, costs, mode descriptions, resource icon combinations, or non-canonical action names; gate control will also prevent named actions/action slots from appearing in bare text or quotation marks. FoM`<FOREST>` / `<MOOR>`Depend on`ResourceText`Maps to existing terrain icon style; Moor major card art passed`public-assets.ref`Fixed external resource loading, Forester's Lodge uses logical paths`assets/moor/major/M012.png`. |
|Farmers of the Moor terrain / deferred minor runtime boundary| `docs/adr/0007-farmers-of-the-moor-variant-runtime.md`, `player.farmTerrain`, `player.farmyardExtensions`, `shared/moor/terrain-flow.ts`, `shared/moor/farm-terrain.ts`, `shared/moor/terrain-adjacency.ts`, farmyard validation helpers, `shared/cards/major/supply.ts`, `player.cardStates[cardId]`, `player.farmyardSpaceStates`, `server/__tests__/farmers-of-the-moor-compatibility-session.test.ts`, `server/__tests__/moor-minors-terrain-flow-session.test.ts`, `server/__tests__/M038_M039_M043_moor-adjacency-overrides-session.test.ts`, `server/__tests__/M041_M109_moor-complex-special-minors-session.test.ts`, `server/__tests__/M044_M049_moor-future-terrain-minors-session.test.ts`, `server/__tests__/M046_M047_moor-covered-terrain-session.test.ts`, `server/__tests__/M050_M051_moor-farmyard-extension-session.test.ts`, `server/__tests__/M052_M053_moor-temporary-people-session.test.ts`, `server/__tests__/M075_M130_moor-minors-session.test.ts`, `server/__tests__/M088_M126_moor-minors-session.test.ts`, `server/__tests__/moor-batch1-scoring-cookery-exchange-session.test.ts`, `server/__tests__/moor-special-action-listener-minors-session.test.ts`, `server/__tests__/E358_FarmersOfTheMoorHeating-session.test.ts`, `server/__tests__/M018_M062_M063_M068_M106_M113_moor-major-supply-minors-session.test.ts`, `server/__tests__/moor-minor-384-room-build-session.test.ts`, `shared/cards/M/moor-batch1-helpers.ts`, `shared/moor/heating.ts` |Small FoM improvements have entered the runtime in batches:`M015` / `M016` / `M017` / `M018` / `M019` / `M020` / `M021` / `M022` / `M023` / `M024` / `M025` / `M026` / `M027` / `M028` / `M029` / `M030` / `M031` / `M032` / `M033` / `M034` / `M035` / `M036` / `M037` / `M038` / `M039` / `M040` / `M041` / `M042` / `M043` / `M044` / `M045` / `M046` / `M047` / `M048` / `M049` / `M050` / `M051` / `M052` / `M053` / `M054` / `M055` / `M056` / `M057` / `M058` / `M059` / `M060` / `M061` / `M062` / `M063` / `M064` / `M065` / `M066` / `M067` / `M068` / `M069` / `M070` / `M071` / `M072` / `M073` / `M074` / `M075` / `M076` / `M077` / `M078` / `M079` / `M080` / `M081` / `M082` / `M083` / `M084` / `M085` / `M086` / `M087` / `M088` / `M089` / `M090` / `M091` / `M092` / `M093` / `M094` / `M095` / `M096` / `M097` / `M098` / `M099` / `M100` / `M101` / `M102` / `M103` / `M104` / `M105` / `M106` / `M107` / `M108` / `M109` / `M110` / `M111` / `M112` / `M113` / `M114` / `M115` / `M116` / `M117` / `M118` / `M119` / `M120` / `M121` / `M122` / `M123` / `M124` / `M125` / `M126` / `M127` / `M128` / `M129` / `M130` / `M131`Realized. Visible Forests / Visible Moors Yes`farmTerrain.kind`The public top layer of Covered Farm Terrain has the same terrain entry.`covered`, does not participate in visible counting, Cut Peat / Slash and Burn candidates, or visible terrain rewards; Fell Trees will reveal covered terrain after removing the top forest, and will not trigger the cleared-space token listener. Small improvements to FoM terrain through common selection leaf reuse`InteractionRequest.selection` / `farm-position`/ Selectable tiles: You can place forest/moor in unused farmyard, remove visible terrain, change forest to moor, change moor to field according to existing adjacency rules; future terrain token reuse`futureMeeples` round entry, `forest`/`moor`Expired into optional terrain selection,`field`Continue to convert to optional plow, which does not support any multi-layer stacked terrain; fenced terrain adjacency counts forest-field / forest-moor edge through pure helper; plow / fence one-time non-standard adjacency through actionContext`adjacencyPolicy`, `allowedTiles`, `fencePolicy`Expression, ordinary subsequent plow/fence maintains the default adjacency; M038 fenced terrain is only recorded in this card before the terrain is fully cleared.`cardStates`, do not enter`player.pastures`. Special action listener reuses existing played-zone`CardListener`Scanning and ordinary ActionFlow/pending do not treat special action as action space, nor trigger place-farmer/action-space hook; Special action resource acquisition/payment, Fell Trees reveal and Slash and Burn fields and other results are processed`GameEvent`Later derived from log mapper`log.actionDetail`, do not write directly`state.log`; When special actions such as Black Market / Illicit Work come with follow-up, follow-up is completed first, and then the final status is read through the internal after-listeners action; M041/M058/M059/M109 reuse ordinary`plow` / `sow` / `pay` / `gain`ActionFlow, M054/M055 reuses the existing special action verification and effect execution through the backend Moor special choice action, M057 uses the extra-turn hook and the take-card-action mode of the backend Moor special choice action, selects and completely executes the visible special action card when there are no ordinary workers, and after completion, marks the current round as used with the extraData of this card; M056/M131 uses`cardStates[cardId].extraData.scheduledOffers`and`scheduled-offer`Internal action expresses future round optional offer, due token is consumed first, and then Cut Peat or animal purchase pops up based on executability. M052 passed`family-growth`of`holdNewbornOnCard`actionContext reuses card-held-worker life cycle, M053 passed`temporaryFromSupply`place-farmer and`farmTerrainMarkers`Express forest-bound supply person. M059 via trigger payload / selection extraData +`allowedFields:'fromSelectedFields'`Limit optional sow to new field, M060 reads the horse count after animal reorganization through card-local post-reorg check after Horse Market and then decides whether to play sow; small improvement of Counter / phase-listener`cardStates[cardId].counters.usage`, existing listener/action hook, optional pending and card local ActionFlow, no temporary state is scattered outside the front end or single card. Farmyard space state small improvement use`player.farmyardSpaceStates`Record blocked space / farmyard goods token / field goods token / non-field crop space;`getUsedFarmyardTileKeys()`Just put`blocksPlacement`Counted as occupied, goods token passes`special-effect`The claim is issued after the grid is actually used or field/private-field-phase sow/reap is triggered. Non-field crop space is prevented from being overwritten by placement lock but is still considered unused. Farmyard Extensions use`player.farmyardExtensions`Extensions share farmyard geometry; used/unused, plow/room/stable/fence, terrain placement, border edge, scoring and FarmBoard all read dynamic shapes, M050/M051 submit real coordinates via farm-position selection. Small improvements to FoM heating via heating metadata/context and`cardStates`Enter the heating demand calculation: M032/M085 uses static metadata, M082 uses wood-to-fuel context and deducts the actual converted wood according to the demand before discount, M086 writes the current harvest discount in the harvest field phase;`1 Sheep` / `Exactly 1 Sheep`Wait for the number of animals to go through the universal prerequisite parser. Major-supply small improvements reuse stack-aware supply helper,`move-major-improvement-to-top`Special effects and card local listeners/modifiers are no longer hard-coded in the main purchase path. Room/build/harvest-building small improved reuse construct`scope:'unit'` modifier, after construct/collect listener, `trueAction:false`follow-up flow, and harvest-local`extraData`food craft-building used mark. Arbitrary multi-layer stacked terrain is still not implemented; Moving Up Major Improvement / Upgrade must use stack-aware major supply and card identity metadata.|
|Farmers of the Moor terrain submission period verification| `getUsedFarmyardTileKeys()`, `commitSelectionChoice()`, `validateFarmPositions()`, `applyTerrainSelectionEffect()` | `selectableTiles`Only as pending display and first-tier candidate;`farm-position`The current farmyard occupancy will be re-read during submission and terrain effect execution, preventing multiple future terrain tokens in the same round from reusing grids already occupied by the previous token.|
| Farmyard usage canonical seam | `shared/domain/farmyard-usage-core.ts`, `shared/domain/farmyard-usage.ts`, `shared/domain/farmyard-geometry.ts`, `shared/domain/farmyard-regions.ts`, `shared/domain/farm.ts`, `A073_AgriculturalFertilizers`, `B132_EstateMaster` |used / unused farmyard spaces unified from`farmyard-usage-core.ts`read;`farmyard-usage.ts` / `farm.ts`Only domain helpers that are compatible with facade, geometry, and fenced region derivation are retained and have no reverse dependencies. Cards may not have handwritten 3x5 or partial occupied set counts; must contain farmyard extensions, terrain, blocked farmyard spaces, and derived pasture tiles.|
| Farm / action-space source metadata | `FenceSegment.type/source`, `WorkerRef.synthetic.kind='linked-occupancy'`, `ActionSpace.blockedBy`, stable count helpers, special-stable card-effect hooks, supply/family token helpers, `action-space-tokens`, action-space category helpers, `actionSpaceAttachments` cardState, `place-farmer-on-space` |Blocking, linked occupancy, 5/6 linked action-space, special stable, stable count, token supply, action grid reserved markers and action grid resource attachments all use source/type metadata, cardState and domain/helper; the player-count filter of the common basic action definition covers 2-6, and 5/6 exclusive action grids are modeled separately; Lessons / Hollow / wood accumulation / Traveling Players / Resource Market and other cross-person action-space semantics share category helper and cover 5/6 variant; extra release of designated target / piggyback release`place-farmer-on-space` internal action, `allowOccupied`Only relaxes occupancy, does not bypass blocked, round availability, action executability or worker supply; action spaces that really require direct-click hard rejection are generally used`strictCanExecute`Opt-in, do not restore single card import or card id branches in the main path.|
| Future meeple action token / Receive | `receive` internal action, `FutureMeepleResourceMap.field/stable/forest/moor`, `FutureMeeple.actionContext`, `futureMeepleActions` stage resume |Round space expired ordinary resources are merged into one by player`receive`transaction, retaining each entry’s`sourceCardId`, triggering the Receive listener without implicitly triggering the Gain listener;`field` / `stable`Still converted from general round-start path to optional`plow`/ free`stables` action; `forest` / `moor`Convert from the same round-start path to optional`farm-position` terrain selection; `actionContext.resourceCondition`It can express the preconditions for round-start resource collection (for example, at least 2 horses in Riding Stables). When the conditions are not met, the expired entry will be removed but no resources will be issued; M044/M045/M048/M049 reuse future terrain tokens without adding state/pending kind; M075/M076/M078/M079 only reuse ordinary future resource tokens and do not introduce future optional pay/gain; cards should be arranged in the future token, no longer write the targetRound + onRoundStart state machine in the card.|
| Animal-holder per-zone storage consumers | `animalCountsByZone`, `getAssignedAnimalsByType()`, `subtractAnimalsFromBoard()`, `InteractionAnimalReorgZone.exclusiveCardZoneLimit`, `InteractionAnimalReorgZone.allowedAnimalTypes`, `wouldExceedExclusiveCardZoneLimit()` |After farm-position backed card zones store animals, all animal consumption/statistics helpers must be read and written.`animalCountsByZone`, cannot read only legacy`animalCounts` / `held`;Pending animal detection is based on current active`AnimalZone`Statistics assigned, do not count stale keyed storage as settled, nor add visible keyed storage twice; exclusive card zone limit and acceptable animal types must be transparently transmitted from the backend pending payload to the frontend unified reorg helper, and`canAccommodateAnimalTotals()`Limits are also implemented during the search period to avoid front-end or candidate generation allowing allocations that would be pruned or filtered by the back-end. Non-active reorg displays from`SerializedPlayerState.farmCardAnimalZones`Shows empty/non-empty candidates; old occupied keyed storage is still available from`animalCountsByZone[zoneId]`persistence`capacity` / `allowedAnimalType` / `allowedAnimalTypes` / `farmPosition`reduction.|
| Scheduled future offers | `scheduled-offer` internal action, `scheduledOffersRoundStartFlow()`, `player.cardStates[cardId].extraData.scheduledOffers` |A one-time optional offer for future rounds, rather than automatically issuing future resource tokens; offer state records`dueRound`, `kind`, cost, target special action or animal,`consumed` / `consumedRound`. When it expires, the internal action consumes the token first, and then decides whether to bounce the choice based on the current executability; the token will not be retained due to rejection, insufficient resources, or unexecutable target. M056 uses it to reuse Cut Peat special action card for verification/turnover/cost; M131 uses it to express 1 food to purchase reserved animals and explicitly enter animal reorg.|
|Future meeple FoM resource coverage| `extendedResourceKeyList`, `receive` internal action, `buildFutureMeepleActionFlow()` |Future resource token reuses the same one for settlement`receive`path, and overwrite base resource outside`fuel` / `horse`; M075/M076/M078/M079 cards that reserve FoM resources do not require the round-start state machine in the card.|
|Harvest / animal common extension point| `reap` private trigger, `HarvestReapSummary.harvestCountApplications`, `computeHarvestSelectionThreshold()`, `computeHarvestFeedingRequirement()`, `getHarvestOutcome()`, `getBreedThreshold()`, `computeBreedableAnimalCount()`, `computeAnimalScoreAdjustment()`, `consumeAnimalPayment()`, `onAnimalRemoved()`, `computePastureCapacityModifiers()`, house / card animal zone helpers, `animal-holder-state.ts`, `animal-payment.ts`, `animalKeysForState()` |Harvest, breeding, feeding, animal capacity rules read summary / modifier / helper; base game still only enumerates sheep / boar / cattle, when Farmers of the Moor is enabled`animalKeysForState()`Only then did horse be included in reorg, breeding, scoring, newborn-animal and all-type semantics;`computeAnimalZones()`It will add a new effect to the current card but does not write it explicitly.`cardId`The card zone complements the source card id; animal reorg interactively retains card zone /`cardId` / `animalCounts` / `allowedAnimalType` / `allowedAnimalTypes` / `farmPosition` / `countsFarmyardSpaceAsUnused`;General reorg continues to write back to unpositioned animal-holder card zone`cardStates[cardId].extraData.animalCounts`, write back to farm-position backed multi-zone card`cardStates[cardId].extraData.animalCountsByZone[zoneId]`, and support`exclusiveCardZoneLimit`Limit the same card to have at most N non-empty candidate zones; fixed calculated by the server`allowedAnimalType`/ zone type with`getInvalidAnimals`Verify the payload, first filter card-invalid animals, then cut the capacity, and pass the acceptable set of single animal types`allowedAnimalTypes`For UI; only explicit`allowedAnimalType: null`The card zone allows mixing. The mixed payload of an ordinary empty card zone will be normalized to a single animal type; the fixed species holder must be written explicitly.`allowedAnimalType`, `animalType`Only expresses the current occupancy; clear existing animals when the zone disappears;`M084_BogPony.extraData.lyingHorseCount`It is the lying horse quantity mark, and M084 animal zone is not added; the horse still stays and occupies the ordinary house / pasture / stable / card animal-holder space, and does not participate in breeding. Horse scoring is based on half the lying number; ordinary animal exchange passes`animal-payment.ts`Delegate those who have played cards first`consumeAnimalPayment()`Process the local marker / holder of the card, and then deduct the board /`extraData.animalCounts` animal-holder / `animalCountsByZone`farm-position-backed holder, only deducted at the end`AnimalZone.capacityCounterKey` + `capacityLossOnPayment`Marked counter-backed holder; capacity enforcement will retain the current active ordinary card-zone animals according to zone capacity, and clean up the old holder storage of the disappeared card-zone; counter-backed zone only participates in retaining resource counting and does not write`extraData`Ordinary holder storage; reorg/capacity enforcement systems that discard animals through`onAnimalRemoved()`Notify the card to synchronize the local marker; with`animalPaymentPreference`Payments can still be prioritized or deferred from specified card counter sources, if`prefer`Specify a specific card counter but miss, do not fall back and deduct other counter-backed holders; the final total number of animals can accommodate helper memoize failed allocation status, and comply with`exclusiveCardZoneLimit`, to avoid impossible repeated searches for multiple animal candidates; pending animal detection only counts the clamped visible count of the current active zones, and the old unkeyed card zones are still compatible with normalized payload totals and are single-type compatible.`{held,animalType}`, `counters.held`Type cards are still managed by the listener inside the card.|
| Hosted Card Animal Zone / harvest breed order | `CardEffect.onComputeSharedAnimalZones()`, `AnimalZone.ownerPlayerId` / `animalOwnerPlayerId` / `breedingOwnerPlayerId` / `displaySource:'borrowed-played-card'`, `InteractionAnimalReorgZone` metadata, `SerializedPlayerState.playedCardAnimalZones` / `farmCardAnimalZones` / `borrowedPlayedCardAnimalZones`, `computeHarvestBreedOrderPriority()`, `shared/actions/effects/reorganize.ts` |Cards can contribute borrowed played-card animal zone to non-owner players; zone persistence is written to the card owner's`cardStates[cardId].extraData.animalCountsByZone[zoneId]`, but statistics, payment, capacity search, pending animal detection and reorg operations are settled according to the Animal Owner; if zone is set`breedingOwnerPlayerId`, the breeding phase will count the zone animals to the breeding owner and deduct them from the Animal Owner's temporary breeding count. All writes`animalCountsByZone`The ordinary holder path must be persisted`cardId` / `ownerPlayerId` / `animalOwnerPlayerId`metadata and press when capacity rewrite / reorg writeback`ownerPlayerId`Write back to the card owner, retaining existing entries that do not belong to the current Animal Owner.`animal-reorg`Pending zones must transparently transmit owner metadata, and the front-end active draft must also be displayed as Animal Owner scoped. even though`getAssignedAnimalsByType(player)`This kind of nothing`GameState`The local helper can only read the current player's cardStates, which must also be pressed`animalOwnerPlayerId === player.id`Filter existing hosted entries; the production card/effect path is`GameState`State must be passed in to read cross-player hosted entries. The serialized snapshot will derive the currently visible owner played-card zones, farm-position card zones and borrowed played-card zones for each player; the front-end owner Played Cards / FarmBoard / Played Cards by-others area permanently displays the 0/N area, and the active reorg draft overwrites the read-only projection and enables the control, mixed`animalCounts`The icons/numbers must be shown separately for each animal rather than degenerating into a pure total. When reorg writes back to the same card owner, it only replaces the hosted entries of the current Animal Owner and retains the animals placed by other players. Harvest breeding order can be adjusted by the priority number returned by the card played. The default is 0. The larger the number, the later. The priority remains the same and the harvest order is maintained; this sorting only affects the breeding phase and does not change the field / feeding / turn order.|

Note: React/Suspense, CDN, browser fallback, etc. are normal terms for the platform/browser and are not considered card architecture risks.

## 6. Infrastructure backlog

There is currently no open infrastructure umbrella pending. Completed historical items such as Before-End Player Dispatch, Scoring Reserve, printed-cost helper, extra-turn rotation, family token supply, Major Improvement stack supply, card boundary guard, single-layer terrain selection flow, FoM immediate resource minor helper, pasture / harvest / breeding / scoring / stable / special-stable, etc. have been merged into §5 Architecture Constraints or §12 Single Card Remarks as needed, and the completion list is no longer maintained in this section.

**Browser local workshop trial sandbox** (PR #619 / wayfinder #605, completed): New`client/local-sandbox/`browser-side custom card compilation + execution infrastructure,`VITE_SANDBOX_EXECUTOR=browser`The whole demo of Time Workshop runs in the browser. Reuse shared AST validator + compiler and use it within Web Worker`new Function`Execute card code, execution semantics and server-side isolated-vm executor by`server/__tests__/local-sandbox-parity.test.ts`Crucify equivalence. **Boundary**: It only serves the dry-run of the single workshop trial (the author's own card), and does not serve the real multiplayer game - the code execution of the real game card still goes through the server-side isolated-vm, and the back-end authority remains unchanged (accepted divergence, see §3). **Security**: The browser executor is not hard-isolated, using strict mode + shadow globals + worker capability removal three-layer defense in depth; the authoritative isolation of third-party published cards is guaranteed by the server. See details`docs/ARCHITECTURE.md`§12.5 and`docs/CUSTOM_CARD_SANDBOX.md` §8.

If you discover a new mechanism that needs to span multiple cards in the future, add a to-do list in this section first; after the implementation is completed and tested or guarded, remove it from this section and synchronize §5 / §9 / §10 / §12.

## 7. Log-system comparison

the reference's log has a two-layer structure:`Core/the reference`Responsible for player-visible gamelog and client status/animation notifications,`Helpers/the reference`Responsible for database changes, checkpoint/step/engine boundaries, and canceling old gamelog packet concurrency after undo`clearTurn` / `refreshUI` / `refreshHand`.

OA did not copy notification-as-rule-source, but built a`GameState.log`The lower level **structured event layer**: emit events when rules are executed, and then uniformly derive UI log, instant notification, highlighting, resource animation, auditing and replay from the events. The backend state remains the only authority.

### Event layer composition

- **GameState field**(`shared/contract/types.ts`): `log`(visible log of i18n key + params),`events`(`GameEvent[]`structured event stream),`nextEventSeq`, `publicEventArchive`(`PublicEventArchivePacket[]`), `nextPublicEventArchivePacketSeq`.
- **Public events**(`shared/contract/events.ts`): 50 event types, covering resource / farm / worker / action / card / futureMeeple / parent / life cycle (round / work / returnHome / harvest / game). unified`GameEventBase`(`schemaVersion` / `id` / `seq` / `round` / `phase` / `type` / actor / target / source / `trigger`),through`EventSink.emit` / `emitMany`Write.
- **Private events**(`shared/contract/private-events.ts`): `private.promptShown` / `private.handChanged` / `private.draftUpdated`Three kinds, with`recipientPlayerId`Do per-viewer masking - non-target players see redaction, draft picks being masked.
- **Mapping policy**(`shared/events/event-mapping-policy.ts`): Each event type declares four consumption channels (log/notification/highlight/resourceAnimation) and replay classification (`replayable` / `metadataOnly`), the channel can be conditional.
- **Log mapper**(`shared/events/log-mapper.ts`): `eventsToLogEntries()`Bundle`GameEvent[]`Batch transfer`LogEntry[]`; `buildLogPresentationPlan()`Unified output of visible rows, consumed event refs and suppressed event refs. Pure resource future meeple settlement is represented by the subsequent Receive entry log, and settlement lines are no longer generated repeatedly.
- **Archive packet**(`shared/events/archive.ts`): `publicEvents.committed`Persist a committed sequence of events;`publicEvents.canceled`Log a complete copy of the undo event and the seq window on undoStep / undoAction.

### Card judgment

Card listener(`shared/cards/card-listeners.ts`)receive`transactionEvents`(the incident of the entire work transaction),`actionEvents`(current action/phase slice) and typed`eventQuery`(`has` / `find` / `filter`). Resource cards are read first`actionEvents`, rollback`transactionEvents`.`resource.paid`carry`paymentFor` / `paymentSources` / `bonusSources` / `bonusChoiceIndex` / `returnedCardId`, the payment discount/refund card is determined based on this, and does not rely on the action result resource fact; it is used when it is necessary to determine the actual consumed resources.`sumActualPaidResource()`from`paymentSources`Restore to avoid treating the card-provided payment resource as a normal resource. Card-purchase candidate metadata Even if it converges to a single candidate row, continue writing at index 0`bonusSources`/Card Resource Stats;construct's raw`costs` + `costAttribution`Project sources to internal pay candidate metadata and`bonusSources`.

### Client consumption

|aisle|document|Responsibilities|
|---|---|---|
| ActionLog / LogPanel | `client/app/action-log-timeline.ts` |Group events by round + legacy logs, eliminate duplicate derivation entries|
|instant notification| `client/app/public-event-notifications.ts` |Representative public event to localized short notification|
|Highlight| `client/app/public-event-notifications.ts` |Extract action / farm / fence highlighted target|
|Resource animation| `client/app/public-event-notifications.ts` |Compute resource flow animations between endpoints|
|Private notification| `client/app/private-event-notifications.ts` |Private event transfers short notifications to target players and removes duplicate signatures|
| Replay | `client/app/replay-timeline.ts` |Rebuild active / canceled / missing timeline from archive committed / canceled packet|

### Convergence Guard

`scripts/check-direct-session-log.ts`(`pnpm run check:direct-session-log`) Using TS AST static analysis to prohibit direct writing of session log bypassing the event layer: interception`state.log`Directly modify, non-whitelisted files`new LogStore()`, non-whitelist function`logStore.append()` / `prependDerivedLogEntries()`. Whitelist only`session-core.ts` / `engine.ts` / `engine-proceed.ts` / `engine-resolve.ts` / `append.ts`specified function.

### Difference from the reference

- `log.enterRound` / `log.harvest*` / `log.placeFarmer`While a small amount of legacy direct write logs are still retained, they will be gradually migrated to event derivation.
- The event layer infrastructure (policy/audit/archive/replay UI) has been closed; richer animation details are subsequent enhancements, not infrastructure gaps.
- Don't copy the reference's approach of using notification as a rule source - the same event layer of OA can already serve card determination, UI, private notification and playback at the same time, and the back-end state remains the only authoritative one.

## 8. The reference anti-patterns: do not copy

- Centralization`SpecialEffect.js`cardId dispatch and single card JS method. OA should retain typed pending/action flow.
- the reference appears in the action/main path with card names or one-off logic such as global Scythe-style flag or C88 stable/fence cost relocation. OA should give priority to using card local hooks/helpers.
- The fencing main path must not be C1 / B30 / E149 to add card id branches or`noWoodPalisades` / `midnightFencer`A type of single card switch; used`FenceSegment.type` / `source`with generic`fencePolicy`Expression differences.
- the reference mutable PHP args and in-place cost rewrite. OA should retain structured modifiers and payment enumeration.
- the reference platform status fields such as`banned`, `implemented`OA product behavior should not be automatically driven.

## 9. Cards using the reference Special Effect

| Deck |cards|
|---|---|
| A | `A102_Grocer`, `A112_ScytheWorker`, `A132_Publican`, `A136_DrudgeryReeve`, `A137_RiverineShepherd`, `A144_Sequestrator`, `A150_Stagehand`, `A158_CulinaryArtist`, `A159_JoineroftheSea`, `A162_ForestTallyman`, `A165_PigBreeder`, `A017_ReclamationPlow`, `A022_Telegram`, `A025_Bassinet`, `A029_AleBenches`, `A039_Chapel`, `A003_PaperKnife`, `A040_PottersYard`, `A053_Claypipe`, `A058_AsparagusKnife`, `A070_LiftingMachine`, `A071_ClearingSpade`, `A072_CalciumFertilizers`, `A081_InterimStorage`, `A082_WorkCertificate`, `A084_Silage`, `A089_StablePlanner`, `A092_AdoptiveParents` |
| B | `B124_Trimmer`, `B146_Illusionist`, `B157_Salter`, `B019_MoldboardPlow`, `B021_HayloftBarn`, `B023_FinalScenario`, `B024_Lasso`, `B034_SpecialFood`, `B003_Moonshine`, `B042_ForestInn`, `B048_ForestStone`, `B055_MaintenancePremium`, `B067_HandTruck`, `B076_Ceilings`, `B081_Handcart`, `B083_MuddyPuddles`, `B085_FarmHand` |
| C | `C104_Collector`, `C115_Sower`, `C120_AgriculturalLabourer`, `C130_OutskirtsDirector`, `C132_TimberShingleMaker`, `C133_Soldier`, `C142_MarketCrier`, `C146_WorkshopAssistant`, `C148_MudWallower`, `C151_SowingDirector`, `C153_PatternMaker`, `C156_HoofCaregiver`, `C162_ForestOwner`, `C167_CattleBuyer`, `C168_AnimalCatcher`, `C018_RollOverPlow`, `C019_SwingPlow`, `C001_Overhaul`, `C022_BasketChair`, `C023_JobContract`, `C024_BedintheGrainField`, `C025_SteamMachine`, `C029_BeerTable`, `C051_FishingNet`, `C057_Crudite`, `C063_CraftBrewery`, `C067_MineralFeeder`, `C069_LandConsolidation`, `C075_Firewood`, `C084_PerennialRye`, `C085_DenBuilder`, `C087_Mason`, `C008_PlantFertilizer`, `C093_InnerDistrictsDirector`, `C099_GardenDesigner` |
| D | `D101_SugarBaker`, `D102_SampleStableMaker`, `D103_CanalBoatman`, `D107_Bellfounder`, `D010_StorksNest`, `D116_TreeInspector`, `D124_Emissary`, `D126_FieldCultivator`, `D127_HardworkingMan`, `D129_LumberVirtuoso`, `D134_OysterEater`, `D137_TradeTeacher`, `D138_PetLover`, `D014_HammerCrusher`, `D150_GodlySpouse`, `D157_PartyOrganizer`, `D158_BeanCounter`, `D161_CabbageBuyer`, `D167_PureBreeder`, `D020_TurnwrestPlow`, `D022_WorkPermit`, `D023_PioneeringSpirit`, `D026_CarpentersYard`, `D027_Retraining`, `D051_Archway`, `D066_PotterCeramics`, `D070_StrawManure`, `D071_Changeover`, `D072_StableManure`, `D074_RoyalWood`, `D082_HuntingTrophy`, `D092_ChildOmbudsman`, `D093_SheepInspector`, `D094_HenpeckedHusband`, `D096_Furnisher`, `D098_Transactor` |
| E | `E103_Wolf`, `E106_EmergencySeller`, `E010_StrawHat`, `E112_GrainThief`, `E123_ResourceHoarder`, `E125_DelayedWayfarer`, `E134_Omnifarmer`, `E148_Lazybones`, `E162_Entrepreneur`, `E166_Roastmaster`, `E167_DairyCrier`, `E022_GuestRoom`, `E027_PiggyBank`, `E004_Thunderbolt`, `E051_WhaleOil`, `E052_Cubbyhole`, `E053_BoarSpear`, `E058_LunchtimeBeer`, `E005_NightLoot`, `E073_Scythe`, `E074_AshTrees`, `E076_LumberPile`, `E078_SleightofHand`, `E081_AlchemistsLab`, `E083_ShepherdsWhistle`, `E085_MasterTanner`, `E086_PenBuilder` |

## 10. Hook inventory

The following table is from the current`ALL_CARD_IMPLS`Mechanical extraction.`*`Indicates action id wildcard; dynamic listener has been runtime`actions`Expand. Newly added FoM special action listener runtime in this round:`M041` / `M054` / `M055` / `M058` / `M059` / `M060` / `M109`Reuse special action before/after dispatch, backend Moor special choice action, normal`plow` / `sow` / `pay` / `gain` flow; `M070` / `M077` / `M092` / `M096` / `M127`use`after.cut-peat`, `M096` / `M118` / `M119`use`after.fell-trees`, `M083` / `M121` / `M123`use`after.hiring-fair`, `M116` / `M122`Walk`moorSpecialActionBonuses`metadata and continue to reuse`after.place-farmer` / `after.collect` / `onBuy` / `onStartReturnHome`Wait for existing hooks; small improvements to FoM heating runtime:`M032`use`computeExtraRoomCapacity` + `computeReplace/isDoable.renovate-house`, `M082`use`onBuy`, `M086`use`onHarvestFieldPhase`; room/build/harvest-building runtime: `M036`Use construct`scope:'unit'` modifier, `M037`use`after.construct`, `M061`use`after.collect`, `M091`Use harvest effect +`after.exchange` / `immediatelyAfter.trade-applied`.

Direct of Protected atomic action`cancel`Rejected before public action lifecycle, not triggered`before` / `during` / `immediatelyAfter` / `after`listener; this table only describes the real success path and the recoverable failure after guard.

The same owner / phase of Action reaction listener enters by default`trigger-select`, different owners are split into activation/prompt of their respective owners; the three stages of harvest field, CardEffect hook and before-end CardEffect target-player step, are also entered by default.`trigger-select`activation. The compute/query hook maintains serial aggregation without player selection, and no more single-card trigger sequence switches are added.

|type|Hook point|cards|
|---|---|---|
| effect | `computeBonusScore` | `A101_CookeryOutfitter`, `A133_Braggart`, `A134_FullFarmer`, `A031_DebtSecurity`, `A032_Manger`, `A038_WoolBlankets`, `A098_StableArchitect`, `A099_FellowGrazer`, `B132_EstateMaster`, `B153_Housemaster`, `B030_WoodPalisades`, `B031_PotteryYard`, `B032_Kettle`, `B039_Loom`, `B098_OrganicFarmer`, `B099_Tutor`, `C100_Butler`, `C132_TimberShingleMaker`, `C134_CowPrince`, `C135_Constable`, `C030_HalfTimberedHouse`, `C031_WritingChamber`, `C033_GreeningPlan`, `C035_LanternHouse`, `C039_StudioBoat`, `C059_SchnappsDistillery`, `D100_LordoftheManor`, `D135_GardeningHeadOfficial`, `D136_AnimalActivist`, `D154_ChimneySweep`, `D157_PartyOrganizer`, `D029_MuckRake`, `D030_ArtisanDistrict`, `D031_Storeroom`, `D033_SummerHouse`, `D034_LuxuriousHostel`, `D035_FodderChamber`, `D036_BreedRegistry`, `D038_MilkingStool`, `D060_LargePottery`, `D092_ChildOmbudsman`, `E124_MayorCandidate`, `E134_Omnifarmer`, `E135_Pickler`, `E136_AnimalHusbandryWorker`, `E153_StoneSculptor`, `E154_Margrave`, `E159_OldMiser`, `E032_Nave`, `E034_LandRegister`, `E035_Misanthropy`, `E037_OxSkull`, `E038_RodCollection`, `M064_FamilyBurialPlot`, `M067_ChamberOfCommerce`, `M070_MoorArchaeology`, `M072_OvenDamper`, `M073_StockBreedingPrize` |
| effect | `computeCostedBonus` | `C099_GardenDesigner`, `E132_VeggieLover`, `M108_GrainDistillery` |
| effect | `computeExtraRoomCapacity` | `A010_WoodenShed`, `A127_Lodger`, `A085_Homekeeper`, `B010_Caravan`, `B085_FarmHand`, `C010_BunkBeds`, `D085_Reader`, `E085_MasterTanner`, `M032_PeatHut` |
| effect | `computeLockedFarmTiles` | `B038_FutureBuildingSite` |
| effect | `computeSharedPostScore` | `A135_AnimalReeve`, `B136_HouseSteward`, `C136_RanchProvost`, `M071_BogBody` |
| effect | `getInvalidAnimals` | `B011_Feedyard`, `B169_LivestockSustainer`, `C011_WildlifeReserve`, `C012_CattleFarm`, `C148_MudWallower`, `C086_LivestockFeeder`, `E011_PettingZoo`, `E033_BeaverColony`, `E036_HerbalGarden`, `E086_PenBuilder` |
| effect | `onAfterHarvest` | `B082_ValueAssets`, `C034_ElephantgrassPlant`, `C066_EternalRyeCultivation`, `D099_EarthenwarePotter`, `E134_Omnifarmer`, `E091_PlowBuilder` |
| effect | `onAfterReap` | `A106_SlurrySpreader`, `A059_PotatoRidger`, `A064_BarleyMill`, `B021_HayloftBarn`, `B058_CrackWeeder`, `C106_PotatoHarvester`, `C120_AgriculturalLabourer`, `D113_FoodMerchant`, `D126_FieldCultivator`, `D063_Lynchet`, `D065_GrainSieve` |
| effect | `onAfterRoundEnd` | `A165_PigBreeder`, `A054_Credit`, `B053_SculptureCourse`, `D167_PureBreeder`, `D064_BakingCourse`, `D079_CarrotMuseum`, `E087_MasterRenovator` |
| effect | `onAllWorkersPlaced` | `E125_DelayedWayfarer` |
| effect | `onBeforeEndGame` | `A136_DrudgeryReeve`, `B133_VillagePeasant`, `C133_Soldier`, `D132_HideFarmer` |
| effect | `onBeforeHarvest` | `A166_Haydryer`, `C092_AutumnMother`, `D032_WoodRake`, `D098_Transactor` |
| effect | `onBeforePlayerTurn` | `D134_OysterEater`(non-flow skip-control, labor turn entrance synchronous consumption`{ skipTurn?: true }`) |
| effect | `contributeExtraTurn` | `A092_AdoptiveParents`(Extra actions in rotation: Contribute XOR[use, forfeit] provider when the player's ordinary workers are exhausted but still have unactivated descendants; enter one-shot trigger-select when multiple providers coexist;`countExtraTurns`Let skip-turn / forced consume write per-source counter according to this card opportunity);`M057_Taps`(When the ordinary workers are exhausted in the work phase and there is a visible special action card available, it will contribute a provider that completely executes the special action; when juxtaposed with A92, etc., select the provider first, and then select M057 before entering the Moor special action card/layout click process; this card`extraData.usedThisRound`To prevent the same work phase from being triggered repeatedly); during actual activation, the provider must re-contribute to the flow, otherwise it will return fail to prevent the stale prompt from being consumed silently.|
| effect | `onBeforeReturnHome` | `A172_BoatPainter`, `B117_Informant`, `B140_FarmyardWorker`, `B158_DistrictManager`, `B160_PubOwner`, `C174_StoneCustodian`, `D130_RecreationalCarpenter`, `D142_PotatoPlanter`, `D051_Archway`, `E010_StrawHat`, `E143_Hewer`, `E158_StoneCustodian`, `E023_Apiary`, `E026_Sundial`, `E027_PiggyBank` |
| effect | `onBeforeStartOfTurn` | `A130_MummysBoy`, `A022_Telegram`, `A049_NestSite`, `B106_MoralCrusader`, `B124_Trimmer`, `B140_FarmyardWorker`, `B070_NewPurchase`, `B089_Groom`, `C101_StallHolder`, `C111_SmallAnimalBreeder`, `C143_StoneBuyer`, `C150_ParrotBreeder`, `C157_ResourceAnalyzer`, `C046_Mandoline`, `C064_CornSchnappsDistillery`, `C067_MineralFeeder`, `C084_PerennialRye`, `D122_ClayCarrier`, `D150_GodlySpouse`, `D046_PelletPress`, `D048_CivicFacade`, `D053_TeaHouse`, `E162_Entrepreneur`, `E022_GuestRoom`, `E028_Bookmark`, `E056_RomanPot`, `E062_SourDough`, `E093_Motivator`, `E096_Elder` |
| effect | `onBuy` | `A102_Grocer`, `A112_ScytheWorker`, `A117_WoodCarrier`, `A011_MudPatch`, `A120_ClayHutBuilder`, `A121_ClayPuncher`, `A125_Priest`, `A127_Lodger`, `A134_FullFarmer`, `A135_AnimalReeve`, `A136_DrudgeryReeve`, `A013_RenovationCompany`, `A144_Sequestrator`, `A162_ForestTallyman`, `A165_PigBreeder`, `A167_BreederBuyer`, `A176_Wheelmaker`, `A177_Middleman`, `A016_RammedClay`, `A019_Handplow`, `A001_Shelter`, `A020_DoubleTurnPlow`, `A022_Telegram`, `A027_OvenSite`, `A002_ShiftingCultivation`, `A033_BigCountry`, `A036_FacadesCarving`, `A039_Chapel`, `A003_PaperKnife`, `A040_PottersYard`, `A043_FarmyardManure`, `A044_PondHut`, `A047_Trellises`, `A004_Baseboards`, `A053_Claypipe`, `A054_Credit`, `A057_MilkingParlor`, `A005_ClayEmbankment`, `A069_LargeGreenhouse`, `A006_StorageBarn`, `A074_StableTree`, `A077_Hod`, `A007_GardenersKnife`, `A086_AnimalTamer`, `A089_StablePlanner`, `A008_FoodBasket`, `A009_YoungAnimalMarket`, `B102_Consultant`, `B105_CaseBuilder`, `B107_Manservant`, `B113_PatchCaregiver`, `B116_Shoreforester`, `B117_Informant`, `B119_Lumberjack`, `B123_RoofBallaster`, `B124_Trimmer`, `B125_EstateWorker`, `B127_Seducer`, `B136_HouseSteward`, `B137_Wholesaler`, `B141_FieldCaretaker`, `B148_PetBroker`, `B149_OpenAirFarmer`, `B014_Hawktower`, `B160_PubOwner`, `B163_Pastor`, `B164_SheepWhisperer`, `B167_StableSergeant`, `B016_MiningHammer`, `B019_MoldboardPlow`, `B001_UpscaleLifestyle`, `B020_ChainFloat`, `B021_HayloftBarn`, `B022_WalkingBoots`, `B023_FinalScenario`, `B025_BreadPaddle`, `B027_Toolbox`, `B029_CookeryLesson`, `B002_MiniPasture`, `B033_Mantlepiece`, `B037_Grange`, `B038_FutureBuildingSite`, `B003_Moonshine`, `B041_Hauberg`, `B042_ForestInn`, `B044_ChickStable`, `B045_StrawberryPatch`, `B046_ClubHouse`, `B048_ForestStone`, `B004_WoodPile`, `B052_GrowingFarm`, `B054_Tumbrel`, `B055_MaintenancePremium`, `B058_CrackWeeder`, `B059_FoodChest`, `B005_StoreofExperience`, `B065_GrainDepot`, `B066_SackCart`, `B006_ExcursiontotheQuarry`, `B071_HarvestHouse`, `B073_GiftBasket`, `B074_ThickForest`, `B076_Ceilings`, `B078_ReedBelt`, `B007_Wage`, `B083_MuddyPuddles`, `B084_AcornsBasket`, `B088_EstablishedPerson`, `B089_Groom`, `B008_MarketStall`, `B093_Confidant`, `B096_TreeFarmJoiner`, `B099_Tutor`, `B009_BeatingRod`, `C104_Collector`, `C106_PotatoHarvester`, `C107_Baker`, `C108_Layabout`, `C113_WinterCaretaker`, `C116_FurnitureMaker`, `C118_WoodCollector`, `C119_SkillfulRenovator`, `C121_ClayKneader`, `C127_Lover`, `C135_Constable`, `C136_RanchProvost`, `C139_BasketmakersWife`, `C140_PackagingArtist`, `C143_StoneBuyer`, `C144_ReedRoofRenovator`, `C146_WorkshopAssistant`, `C148_MudWallower`, `C155_FoodDistributor`, `C156_HoofCaregiver`, `C161_PotatoDigger`, `C162_ForestOwner`, `C165_GameCatcher`, `C166_CattleWhisperer`, `C016_FieldFences`, `C017_NewlyPlowedField`, `C019_SwingPlow`, `C001_Overhaul`, `C022_BasketChair`, `C024_BedintheGrainField`, `C026_Flail`, `C002_Stable`, `C038_Christianity`, `C039_StudioBoat`, `C003_CarriageTrip`, `C040_CanvasSack`, `C044_ChickenCoop`, `C047_GardenClaw`, `C004_WritingBoards`, `C050_StableYard`, `C057_Crudite`, `C005_Remodeling`, `C060_SmallPottersOven`, `C065_Granary`, `C006_StoneClearing`, `C072_FestivalPlanning`, `C074_PrivateForest`, `C077_ClaySupply`, `C078_ReedHattedToad`, `C079_StoneCart`, `C007_BladeShears`, `C081_MaterialHub`, `C083_EarlyCattle`, `C086_LivestockFeeder`, `C087_Mason`, `C008_PlantFertilizer`, `C098_CubeCutter`, `C009_AutomaticWaterTrough`, `D109_SowingMaster`, `D114_SeedTrader`, `D116_TreeInspector`, `D117_WoodExpert`, `D118_Bonehead`, `D120_ClayDeliveryman`, `D122_ClayCarrier`, `D126_FieldCultivator`, `D127_HardworkingMan`, `D131_CraftsmanshipPromoter`, `D135_GardeningHeadOfficial`, `D136_AnimalActivist`, `D141_SeedSeller`, `D145_RoofExaminer`, `D156_RetailDealer`, `D162_ClayFirer`, `D166_StableMilker`, `D167_PureBreeder`, `D177_Graduate`, `D001_ZigzagHarrow`, `D020_TurnwrestPlow`, `D022_WorkPermit`, `D023_PioneeringSpirit`, `D002_DwellingPlan`, `D003_Furrows`, `D040_Cesspit`, `D041_HorseDrawnBoat`, `D043_Hutch`, `D044_ForestWell`, `D045_SheepWell`, `D047_Churchyard`, `D004_CrossCutWood`, `D050_ForeignAid`, `D051_Archway`, `D057_WholesaleMarket`, `D005_FieldClay`, `D060_LargePottery`, `D062_BeerTap`, `D067_ReapHook`, `D069_SmallGreenhouse`, `D006_PetrifiedWood`, `D074_RoyalWood`, `D078_ReedPond`, `D007_Trident`, `D084_FeedPellets`, `D088_Millwright`, `D008_FernSeeds`, `D091_Plowman`, `D096_Furnisher`, `D097_BeggingStudent`, `D099_EarthenwarePotter`, `D009_GameTrade`, `E103_Wolf`, `E104_SpiceTrader`, `E105_Pioneer`, `E106_EmergencySeller`, `E119_LandHeir`, `E120_ScrapCollector`, `E123_ResourceHoarder`, `E125_DelayedWayfarer`, `E127_DiligentFarmer`, `E135_Pickler`, `E136_AnimalHusbandryWorker`, `E138_LivestockExpert`, `E139_BunnyBreeder`, `E140_Carter`, `E145_Parvenu`, `E148_Lazybones`, `E155_Visionary`, `E161_ElderBaker`, `E167_DairyCrier`, `E001_PoleBarns`, `E022_GuestRoom`, `E025_BumperCrop`, `E028_Bookmark`, `E002_RenovationMaterials`, `E033_BeaverColony`, `E003_TeaTime`, `E040_BeeStatue`, `E041_MuddyWaters`, `E042_WaterGully`, `E043_BarnCats`, `E044_FodderBeets`, `E045_FruitLadder`, `E046_WaterlilyPond`, `E004_Thunderbolt`, `E051_WhaleOil`, `E056_RomanPot`, `E005_NightLoot`, `E060_WorkingGloves`, `E063_IronOven`, `E064_SimpleOven`, `E065_Almsbag`, `E006_Recount`, `E074_AshTrees`, `E076_LumberPile`, `E078_SleightofHand`, `E007_Pumpernickel`, `E081_AlchemistsLab`, `E082_Profiteering`, `E008_FarmersMarket`, `E094_Prophet`, `E097_Beneficiary`, `E098_Prodigy`, `E009_BarteringHut` |
| effect | `onBuy` (FoM minors) | `M019_LawnTurf`, `M020_PeatPellets`, `M022_EcologicalNiche`, `M023_EdgeOfTheForest`, `M024_BasicSupplies`, `M025_HouseholdInventory`, `M026_ChimneyHood`, `M027_GardenPath`, `M028_OutOnTheWallaby`, `M029_Tinker`, `M030_FarmAnimalMarket`, `M031_LivestockMarket`, `M050_FarmExtension`, `M051_MoorEnclosures`, `M052_WeddingCoach`, `M053_ForestHut`, `M056_PeatCuttingRights`, `M064_FamilyBurialPlot`, `M065_FireBrigade`, `M067_ChamberOfCommerce`, `M072_OvenDamper`, `M074_Administration`, `M075_FuelStorage`, `M076_Flatboat`, `M078_Barge`, `M079_PeatSled`, `M080_AdvancePayment`, `M082_Firewood`, `M083_CoalSeam`, `M090_WinterStorehouse`, `M095_FallowFields`, `M099_HealingClay`, `M100_Pheromones`, `M101_ButchersBlock`, `M104_WildHarvest`, `M115_OakBark`, `M123_StoneQuarry`, `M125_HardwareStore`, `M126_CooperativeStore`, `M131_CattleStall` |
| effect | `computeBreedThreshold` | `E084_DollysMother` |
| effect | `computeBreedableAnimalCount` | `M084_BogPony` |
| effect | `computeHarvestBreedOrderPriority` | `M033_NightPasture` |
| effect | `computeAnimalScoreAdjustment` | `M084_BogPony` |
| effect | `consumeAnimalPayment` | `M084_BogPony` |
| effect | `onAnimalRemoved` | `M084_BogPony` |
| effect | `computePastureCapacityModifiers` | `A012_DrinkingTrough`, `B072_LoveforAgriculture`, `D011_LawnFertilizer` |
| effect | `onComputeAnimalZones` | `A011_MudPatch`, `A148_Woolgrower`, `A086_AnimalTamer`, `B115_TinsmithMaster`, `B011_Feedyard`, `B012_Stockyard`, `B148_PetBroker`, `B169_LivestockSustainer`, `B086_TruffleSearcher`, `C011_WildlifeReserve`, `C012_CattleFarm`, `C148_MudWallower`, `C086_LivestockFeeder`, `C089_StableMaster`, `D148_DomesticianExpert`, `D086_SheepAgent`, `E011_PettingZoo`, `M033_NightPasture`, `M034_HomeWood`, `M035_HorseTrough`, `E012_AnimalBedding`, `E033_BeaverColony`, `E036_HerbalGarden`, `E086_PenBuilder` |
| effect | `onComputeSharedAnimalZones` | `M033_NightPasture` |
| effect | `onComputeSowableFields` | `B113_PatchCaregiver`, `B141_FieldCaretaker`, `B068_Beanfield`, `B072_LoveforAgriculture`, `C070_LettucePatch`, `D025_WitchesDanceFloor`, `D075_WoodField`, `E068_CherryOrchard`, `E069_MelonPatch`, `E070_CropRotationField`, `E072_ArtichokeField`, `E080_RockGarden`, `M111_NoTillFarming` |
| effect | `onEndHarvest` | `A112_ScytheWorker`, `A145_Ropemaker`, `B011_Feedyard`, `C113_WinterCaretaker`, `C124_StoneImporter`, `C071_Slurry`, `D072_StableManure`, `D115_FodderPlanter`, `E133_ChampionBreeder`, `E073_Scythe`, `E090_DungCollector`, `E099_UncaringParents` |
| effect | `onEndHarvestFeedingPhase` | `C041_FarmStore`, `D076_SocialBenefits`, `E083_ShepherdsWhistle`, `M091_RoutineWork` |
| effect | `onEndHarvestFieldPhase` | `A061_WinnowingFan`, `C110_HomeBrewer`, `C029_BeerTable`, `C054_MarketBooth`, `E112_GrainThief` |
| effect | `onEndTurn` | `B027_Toolbox`, `D074_RoyalWood`, `M062_HearthBrush`, `M063_PastoralLetter` |
| effect | `onHarvest` | `M088_PeatIron` |
| effect | `onHarvestFeedingPhase` | `A062_BeerKeg`, `C049_BeerStall`, `C055_Studio`, `C063_CraftBrewery`, `D012_MilkingPlace`, `D133_BeerTentOperator`, `D084_FeedPellets`, `E110_Dentist`, `E132_VeggieLover`, `E142_Smuggler`, `E039_Paintbrush`, `E048_TownHall`, `M074_Administration` |
| effect | `onHarvestFieldPhase` | `A104_WoodHarvester`, `A118_Treegardener`, `B101_FurnitureCarpenter`, `B113_PatchCaregiver`, `B141_FieldCaretaker`, `B039_Loom`, `B050_ButterChurn`, `B068_Beanfield`, `B072_LoveforAgriculture`, `C070_LettucePatch`, `C098_CubeCutter`, `D025_WitchesDanceFloor`, `D038_MilkingStool`, `D075_WoodField`, `E107_LandSurveyor`, `E068_CherryOrchard`, `E069_MelonPatch`, `E070_CropRotationField`, `E072_ArtichokeField`, `E080_RockGarden`, `M086_SpinningMill`, `M128_Workbench` |
| effect | `onReturnHome` | `A029_AleBenches`, `A053_Claypipe`, `A070_LiftingMachine`, `A084_Silage`, `B124_Trimmer`, `B139_ForestScientist`, `B022_WalkingBoots`, `C051_FishingNet`, `C075_Firewood`, `D052_RollingPin`, `M053_ForestHut` |
| effect | `onRoundEnd` | `A054_Credit` |
| effect | `onRoundStart` | `A076_Cob`, `A081_InterimStorage`, `A090_PlowDriver`, `A096_TaskArtisan`, `B110_Pavior`, `B114_Childless`, `B116_Shoreforester`, `B118_SmallscaleFarmer`, `B135_NutritionExpert`, `B172_CattleCaregiver`, `B023_FinalScenario`, `B029_CookeryLesson`, `B057_Scullery`, `B069_PottersMarket`, `B081_Handcart`, `B093_Confidant`, `B097_Scholar`, `C103_GreenGrocer`, `C123_Freemason`, `C125_Nightworker`, `C159_FishermansFriend`, `C021_HeartofStone`, `C039_StudioBoat`, `D116_TreeInspector`, `D022_WorkPermit`, `D054_TroutPool`, `D069_SmallGreenhouse`, `D093_SheepInspector`, `E100_MuseumCaretaker`, `E102_Acquirer`, `E111_Recluse`, `E126_TaxCollector`, `E152_BargainHunter`, `E168_AnimalTamersApprentice`, `E088_MasterFencer`, `M056_PeatCuttingRights`, `M057_Taps`, `M131_CattleStall` |
| effect | `onSowExtraField` | `B113_PatchCaregiver`, `B141_FieldCaretaker`, `B068_Beanfield`, `B072_LoveforAgriculture`, `C070_LettucePatch`, `D025_WitchesDanceFloor`, `D075_WoodField`, `E068_CherryOrchard`, `E069_MelonPatch`, `E070_CropRotationField`, `E072_ArtichokeField`, `E080_RockGarden`, `M111_NoTillFarming` |
| effect | `onStartHarvest` | `C178_OnSiteReverend`, `C024_BedintheGrainField`, `C062_CookeryExtension`, `D129_LumberVirtuoso`, `D153_WealthyMan`, `D061_BaleofStraw`, `D097_BeggingStudent`, `E110_Dentist`, `E111_Recluse`, `E117_PipeSmoker`, `E147_AnimalDriver`, `E149_MidnightFencer`, `E058_LunchtimeBeer`, `E061_RaisedBed`, `M091_RoutineWork`, `M102_SavingsDeposit`, `M104_WildHarvest` |
| effect | `onStartHarvestFeedingPhase` | `C107_Baker`, `E052_Cubbyhole` |
| effect | `onStartHarvestFieldPhase` | `A112_ScytheWorker`, `B165_GameProvider`, `B061_ThreeFieldRotation`, `C057_Crudite`, `D070_StrawManure`, `D072_StableManure`, `E112_GrainThief`, `E073_Scythe` |
| effect | `onStartReturnHome` | `A100_Curator`, `A127_Lodger`, `A141_TurnipFarmer`, `A151_Minstrel`, `A152_NightSchoolStudent`, `A157_Bohemian`, `A035_SwimmingClass`, `A058_AsparagusKnife`, `C155_FoodDistributor`, `C171_YoungArtist`, `C097_SeedResearcher`, `D102_SampleStableMaker`, `D107_Bellfounder`, `D010_StorksNest`, `D018_SteamPlow`, `E020_IronHoe`, `E087_MasterRenovator`, `M097_VillageHall` |
| effect | `resolveChoice` | `A136_DrudgeryReeve`, `B146_Illusionist`, `B157_Salter`, `B003_Moonshine`, `C104_Collector`, `C133_Soldier`, `C146_WorkshopAssistant`, `D132_HideFarmer`, `D023_PioneeringSpirit`, `E134_Omnifarmer`, `E148_Lazybones` |
| exchange | `anytime` | `A060_OrientalFireplace`, `B104_SheepWalker`, `B032_Kettle`, `B080_HardPorcelain`, `C139_BasketmakersWife`, `C050_StableYard`, `D162_ClayFirer`, `D172_PutcherMaker`, `D025_WitchesDanceFloor`, `D059_EarthOven`, `D060_LargePottery`, `E109_BraidMaker`, `M081_PeatBoat`, `M105_OpenGrill` |
| exchange | `bake-bread` | `A060_OrientalFireplace`, `D025_WitchesDanceFloor`, `D059_EarthOven`, `D064_BakingCourse`, `E063_IronOven`, `E064_SimpleOven`, `M105_OpenGrill` |
| exchange | `harvest` | `C105_BasketCarrier`, `C109_SchnappsDistiller`, `C059_SchnappsDistillery`, `D108_StoneCarver`, `D155_Ebonist`, `D062_BeerTap`, `E153_StoneSculptor`, `M108_GrainDistillery` |
| handHooks | `onBeforeStartOfTurn` | `E096_Elder` |
| listener | `after.*` | `E047_SyrupTap`, `M092_AridField`, `M095_FallowFields`, `M096_FallowLand` |
| listener | `after.bake-bread` | `A030_BakingSheet`, `A063_DutchWindmill`, `C061_BeerStein`, `E057_CheeseFondue` |
| listener | `after.collect` | `A103_Portmonger`, `A142_Cordmaker`, `A146_StorehouseSteward`, `A015_CarpentersAxe`, `A164_WoodWorker`, `A017_ReclamationPlow`, `A175_HollowGardener`, `A179_MountainShepherd`, `A023_StoneCompany`, `A048_ShavingHorse`, `A095_Angler`, `B131_Equipper`, `B147_Huntsman`, `B015_CarpentersBench`, `B162_ForestClearer`, `B017_ForestPlow`, `B174_RiverbankGardener`, `B180_GameTeaser`, `B021_HayloftBarn`, `B034_SpecialFood`, `B048_ForestStone`, `B055_MaintenancePremium`, `B079_Corf`, `C102_TreeGuard`, `C114_SoilScientist`, `C163_MaterialDeliveryman`, `C177_MountainHiker`, `C042_RavenousHunger`, `C052_HuntsmansHat`, `C081_MaterialHub`, `D140_Loudmouth`, `D143_TreeCutter`, `D144_WaterWorker`, `D146_Porter`, `D169_Plowsmith`, `D174_LoessGardener`, `D180_PartTimeWorker`, `D019_PulverizerPlow`, `D036_BreedRegistry`, `D073_SupplyBoat`, `E103_Wolf`, `E118_KindlingGatherer`, `E140_Carter`, `E015_NailBasket`, `E038_RodCollection`, `E051_WhaleOil`, `E053_BoarSpear`, `E077_Mattock`, `M061_HayWagon`, `M098_FishSmokehouse`, `M110_FarmCart`, `M117_DraughtHorses`, `M118_TimberMill`, `M127_Wheelbarrow` |
| listener | `after.construct` | `A110_Roughcaster`, `A111_WallBuilder`, `A167_BreederBuyer`, `A178_CarpentersBoy`, `A021_FamilyFriendHome`, `A040_PottersYard`, `A073_AgriculturalFertilizers`, `A093_BedMaker`, `B111_Rustic`, `B140_FarmyardWorker`, `B163_Pastor`, `B027_Toolbox`, `D123_RenovationPreparer`, `D128_BuildingTycoon`, `D163_JourneymanBricklayer`, `D074_RoyalWood`, `D094_HenpeckedHusband`, `D096_Furnisher`, `E123_ResourceHoarder`, `E049_Twibil`, `E052_Cubbyhole`, `M037_BuildingPlan` |
| listener | `after.cut-peat` | `M048_ForestSwamp`, `M070_MoorArchaeology`, `M077_DryingField`, `M092_AridField`, `M096_FallowLand`, `M127_Wheelbarrow` |
| listener | `after.exchange` | `A048_ShavingHorse`, `B021_HayloftBarn`, `B029_CookeryLesson`, `C148_MudWallower`, `C053_GypsysCrock`, `D036_BreedRegistry`, `D056_FatstockStretcher`, `E103_Wolf`, `E053_BoarSpear`, `E085_MasterTanner`, `M091_RoutineWork`, `M115_OakBark` |
| listener | `after.family-growth` | `D150_GodlySpouse`, `D157_PartyOrganizer`, `E113_Godmother`, `M089_BirthingHouse`, `M103_ForestKindergarten` |
| listener | `after.fell-trees` | `M096_FallowLand`, `M118_TimberMill`, `M119_AlderSwamp` |
| listener | `after.fence` | `A144_Sequestrator`, `A034_Loppers`, `A040_PottersYard`, `A068_AsparagusGift`, `A073_AgriculturalFertilizers`, `B124_Trimmer`, `B140_FarmyardWorker`, `B027_Toolbox`, `B094_StockProtector`, `C179_BovinePioneer`, `D089_Stablehand`, `E108_BlackberryFarmer`, `E074_AshTrees` |
| listener | `after.gain` | `A048_ShavingHorse`, `B021_HayloftBarn`, `C120_AgriculturalLabourer`, `C052_HuntsmansHat`, `D036_BreedRegistry`, `E103_Wolf`, `E118_KindlingGatherer`, `E053_BoarSpear` |
| listener | `after.hiring-fair` | `M083_CoalSeam`, `M121_Loam`, `M123_StoneQuarry` |
| listener | `after.pop-card-stack` | `D036_BreedRegistry` |
| listener | `after.receive` | `A048_ShavingHorse`, `B021_HayloftBarn`, `B096_TreeFarmJoiner`, `C120_AgriculturalLabourer`, `C052_HuntsmansHat`, `E053_BoarSpear` |
| listener | `after.take-from-card` | `D036_BreedRegistry` |
| listener | `immediatelyAfter.harvest-feed-conversion` | `D036_BreedRegistry` |
| listener | `immediatelyAfter.future-meeple-resolved` | `D036_BreedRegistry` |
| listener | `after.improvement` | `A109_SmallTrader`, `A131_CraftTeacher`, `A041_VegetableSlicer`, `B100_Clutterer`, `B049_Scales`, `C115_Sower`, `C137_CharcoalBurner`, `C043_FarmBuilding`, `C075_Firewood`, `C080_RockyTerrain`, `D118_Bonehead`, `D161_CabbageBuyer`, `D173_TownClerk`, `D080_BrickHammer`, `E144_WaresSalesman`, `E156_ClaypitOwner`, `E165_MasterHuntsman`, `E018_SeedAlmanac`, `E031_Upholstery`, `M093_FarmhandsQuarters` |
| listener | `after.pass-minor-card-to-left` | `M093_FarmhandsQuarters` |
| listener | `after.occupation` | `A139_HollowWarden`, `A096_TaskArtisan`, `B100_Clutterer`, `B103_FieldMerchant`, `B138_ForestGuardian`, `B151_LittlePeasant`, `B155_ArtTeacher`, `B025_BreadPaddle`, `B049_Scales`, `C120_AgriculturalLabourer`, `C068_Bookcase`, `C080_RockyTerrain`, `C095_BasketWeaver`, `D118_Bonehead`, `D163_JourneymanBricklayer`, `D042_EducationBonus`, `D095_SiteManager`, `E101_Blighter`, `E116_FirCutter`, `E144_WaresSalesman`, `E157_Usufructuary`, `E163_Patroness`, `E165_MasterHuntsman`, `E089_Stallwright`, `E095_Miller` |
| listener | `after.pay` | `B018_GrasslandHarrow`, `C116_FurnitureMaker`, `C148_MudWallower`, `D171_SeniorTeacher`, `D074_RoyalWood`, `E122_Cottar`, `E123_ResourceHoarder`, `E128_Saddler`, `E054_Contraband` |
| listener | `after.place-farmer` | `A113_HeresyTeacher`, `A114_SeasonalWorker`, `A116_WoodCutter`, `A119_FirewoodCollector`, `A121_ClayPuncher`, `A122_PanBaker`, `A128_RiparianBuilder`, `A129_Swagman`, `A130_MummysBoy`, `A137_RiverineShepherd`, `A138_Harpooner`, `A139_HollowWarden`, `A140_ShovelBearer`, `A147_AnimalDealer`, `A149_HouseArtist`, `A150_Stagehand`, `A154_Paymaster`, `A155_Conjurer`, `A156_Buyer`, `A158_CulinaryArtist`, `A159_JoineroftheSea`, `A160_Lutenist`, `A161_PatchCaretaker`, `A163_BuildingExpert`, `A168_AnimalTeacher`, `A171_Sidekick`, `A177_Middleman`, `A018_WheelPlow`, `A024_ThreshingBoard`, `A042_ForestLakeHut`, `A046_ClawKnife`, `A050_MilkJug`, `A051_DriftNetBoat`, `A066_FeedingDish`, `A067_CornScoop`, `A072_CalciumFertilizers`, `A077_Hod`, `A078_Canoe`, `A080_StoneTongs`, `A082_WorkCertificate`, `A092_AdoptiveParents`, `A097_Freshman`, `B108_OvenFiringBoy`, `B112_Silokeeper`, `B121_Geologist`, `B128_Plumber`, `B130_FullPeasant`, `B137_Wholesaler`, `B142_Greengrocer`, `B143_ClayWarden`, `B144_Collier`, `B150_LargeScaleFarmer`, `B152_JuniorArtist`, `B156_StorehouseKeeper`, `B161_Weakling`, `B166_CattleFeeder`, `B173_Sweeper`, `B178_TagAlong`, `B019_MoldboardPlow`, `B024_Lasso`, `B028_ForestryStudies`, `B029_CookeryLesson`, `B040_BreweryPond`, `B043_Chophouse`, `B047_HerringPot`, `B056_Brook`, `B060_BrewingWater`, `B062_Pitchfork`, `B064_MillWheel`, `B077_LoamPit`, `B087_Cottager`, `B090_CooperativePlower`, `B091_AssistantTiller`, `B092_LittleStickKnitter`, `C117_Legworker`, `C121_ClayKneader`, `C126_Excavator`, `C130_OutskirtsDirector`, `C131_PrivateTeacher`, `C138_AnimalFeeder`, `C141_SheepProvider`, `C142_MarketCrier`, `C145_ForestReviewer`, `C147_Cowherd`, `C148_MudWallower`, `C150_ParrotBreeder`, `C151_SowingDirector`, `C152_Puppeteer`, `C164_GermanHeathKeeper`, `C167_CattleBuyer`, `C176_Cleanacre`, `C019_SwingPlow`, `C020_MolePlow`, `C023_JobContract`, `C026_Flail`, `C039_StudioBoat`, `C042_RavenousHunger`, `C045_Stew`, `C048_Farmstead`, `C082_HardwareStore`, `C090_FieldWatchman`, `C091_PlowHero`, `C093_InnerDistrictsDirector`, `D101_SugarBaker`, `D103_CanalBoatman`, `D109_SowingMaster`, `D112_YoungFarmer`, `D134_OysterEater`, `D137_TradeTeacher`, `D141_SeedSeller`, `D144_WaterWorker`, `D149_CasualWorker`, `D151_SpinDoctor`, `D156_RetailDealer`, `D158_BeanCounter`, `D160_Midwife`, `D161_CabbageBuyer`, `D164_PetGrower`, `D165_PigStalker`, `D020_TurnwrestPlow`, `D027_Retraining`, `D039_TruffleSlicer`, `D055_NewMarket`, `D068_SmallBasket`, `D092_ChildOmbudsman`, `D093_SheepInspector`, `E105_Pioneer`, `E115_SeedServant`, `E116_FirCutter`, `E118_KindlingGatherer`, `E131_MarketMaster`, `E148_Lazybones`, `E160_KelpGatherer`, `E019_OxGoad`, `E040_BeeStatue`, `E066_BarnShed`, `E082_Profiteering`, `E095_Miller`, `M083_CoalSeam`, `M087_PeatBarge`, `M094_PeatBath`, `M099_HealingClay`, `M114_RiversideWoods`, `M120_RiverClay`, `M124_StoneWagon`, `M129_PlowhorseMarket`, `M130_Nosebag` |
| listener | `after.plow` | `A105_BarrowPusher`, `A144_Sequestrator`, `A017_ReclamationPlow`, `A040_PottersYard`, `B159_LieutenantGeneral`, `B177_StoneClawer`, `C172_FieldCounter`, `C080_RockyTerrain`, `D104_Cultivator`, `E164_MountainPlowman` |
| listener | `after.receive` | `A048_ShavingHorse`, `B021_HayloftBarn`, `C120_AgriculturalLabourer`, `C052_HuntsmansHat`, `E053_BoarSpear` |
| listener | `after.renovate-house` | `A110_Roughcaster`, `A120_ClayHutBuilder`, `A037_Bucksaw`, `A045_FireProtectionPond`, `B107_Manservant`, `B134_HousebookMaster`, `B168_PastureMaster`, `B016_MiningHammer`, `B055_MaintenancePremium`, `B076_Ceilings`, `C119_SkillfulRenovator`, `C132_TimberShingleMaker`, `C146_WorkshopAssistant`, `C149_ResourceRecycler`, `C153_PatternMaker`, `D111_InteriorDecorator`, `D161_CabbageBuyer`, `D163_JourneymanBricklayer`, `D027_Retraining`, `D077_RecycledBrick`, `D081_RoofLadder`, `E123_ResourceHoarder`, `E154_Margrave`, `E087_MasterRenovator` |
| listener | `after.reorganize` | `C148_MudWallower` |
| listener | `after.sow` | `A079_GardenHoe`, `B115_TinsmithMaster`, `B054_Tumbrel`, `C073_SeaweedFertilizer`, `D058_Gritter`, `E050_WildGreens`, `E071_CowPatty`, `E079_FieldSpade`, `M095_FallowFields` |
| listener | `after.stables` | `A167_BreederBuyer`, `A040_PottersYard`, `A043_FarmyardManure`, `A073_AgriculturalFertilizers`, `A074_StableTree`, `B140_FarmyardWorker`, `B027_Toolbox`, `C056_FeedFence`, `D166_StableMilker`, `D168_Stockman`, `E114_ShedBuilder` |
| listener | `after.store-on-card` | `E027_PiggyBank` |
| listener | `after.take-from-card` | `E027_PiggyBank` |
| listener | `after.wish-children` | `E113_Godmother` |
| listener | `anytime.*` | `A092_AdoptiveParents`, `A102_Grocer`, `A153_PigOwner`, `A071_ClearingSpade`, `B154_SheepKeeper`, `B157_Salter`, `B173_Sweeper`, `B035_HookKnife`, `B069_PottersMarket`, `B083_MuddyPuddles`, `B085_FarmHand`, `C101_StallHolder`, `C115_Sower`, `C143_StoneBuyer`, `C150_ParrotBreeder`, `C172_FieldCounter`, `C018_RollOverPlow`, `C046_Mandoline`, `C057_Crudite`, `C064_CornSchnappsDistillery`, `C069_LandConsolidation`, `C084_PerennialRye`, `C085_DenBuilder`, `C087_Mason`, `C094_StableCleaner`, `D106_WhiskyDistiller`, `D114_SeedTrader`, `D122_ClayCarrier`, `D124_Emissary`, `D013_Trowel`, `D173_TownClerk`, `D046_PelletPress`, `D053_TeaHouse`, `D071_Changeover`, `D087_MasterBuilder`, `E013_StoneHouseReconstruction`, `E014_WoodSaw`, `E022_GuestRoom`, `E027_PiggyBank`, `E062_SourDough`, `E086_PenBuilder`, `E091_PlowBuilder`, `M090_WinterStorehouse`, `M111_NoTillFarming`, `M125_HardwareStore`, `M126_CooperativeStore` |
| listener | `before.*` | `A124_Knapper`, `A126_MasterWorkman`, `B120_Sweep` |
| listener | `before.bake-bread` | `B067_HandTruck`, `C060_SmallPottersOven`, `D066_PotterCeramics` |
| listener | `before.collect` | `A107_Catcher`, `A115_ChiefForester`, `A052_ThrowingAxe`, `A081_InterimStorage`, `A091_ShiftingCultivator`, `B122_Mineralogist`, `B138_ForestGuardian`, `B146_Illusionist`, `B034_SpecialFood`, `B051_DiggingSpade`, `C051_FishingNet`, `C076_WoodCart`, `D105_Sculptor`, `D125_ForestTrader` |
| listener | `before.construct` | `A040_PottersYard`, `A073_AgriculturalFertilizers`, `D119_WoodBarterer` |
| listener | `before.cut-peat` | `M112_PeatAshFertilizer` |
| listener | `before.cultivation` | `C112_Thresher` |
| listener | `before.exchange` | `D056_FatstockStretcher`, `E085_MasterTanner` |
| listener | `before.family-growth` | `E130_Overachiever` |
| listener | `before.farmland` | `C112_Thresher` |
| listener | `before.fence` | `A040_PottersYard`, `A068_AsparagusGift`, `A073_AgriculturalFertilizers`, `B094_StockProtector`, `D119_WoodBarterer`, `E074_AshTrees` |
| listener | `before.grain-utilization` | `C112_Thresher` |
| listener | `before.improvement` | `B075_WoodWorkshop` |
| listener | `before.lessons` | `B063_Tasting` |
| listener | `before.lessons-3` | `B063_Tasting` |
| listener | `before.lessons-4` | `B063_Tasting` |
| listener | `before.meeting-place` | `D139_Chairman` |
| listener | `before.occupation` | `D152_Patron`, `D049_Bookshelf`, `E051_WhaleOil` |
| listener | `before.place-farmer` | `A092_AdoptiveParents`, `C154_TwinResearcher`, `C158_ForestCampaigner`, `C015_Trellis`, `C160_Outrider`, `C028_TeachersDesk`, `C048_Farmstead`, `D110_FishFarmer`, `D147_TrapBuilder`, `D016_WoodenWheyBucket`, `D028_WritingDesk`, `D083_Pigswill`, `D090_PlowMaker`, `E121_HillCultivator`, `E137_FlaxFarmer`, `E141_VegetableVendor`, `E166_Roastmaster`, `E017_SkimmerPlow`, `E055_StoneWeir`, `E059_CombandCutter`, `E067_GrainBag` |
| listener | `before.plow` | `A040_PottersYard` |
| listener | `before.renovate-house` | `D014_HammerCrusher` |
| listener | `before.sow` | `A132_Publican`, `A065_SeedPellets`, `D017_DrillHarrow` |
| listener | `before.stables` | `A040_PottersYard`, `A073_AgriculturalFertilizers` |
| listener | `computeArgs.place-farmer` | `A130_MummysBoy`, `A025_Bassinet`, `A026_SleepingCorner`, `A028_ForestSchool`, `A094_LazySowman`, `B129_Seatmate`, `B151_LittlePeasant`, `C129_SecondSpouse`, `C150_ParrotBreeder`, `D112_YoungFarmer`, `D024_BrotherlyLove`, `D050_ForeignAid`, `E129_Imitator`, `E150_RockBeater`, `E021_SheepRug` |
| listener | `computeChoiceCandidates.improvement` | `C027_Blueprint`, `D131_CraftsmanshipPromoter`, `E161_ElderBaker` |
| listener | `computeChoiceCandidates.renovate-house` | `A087_Conservator`, `D013_Trowel` |
| listener | `computeCosts.construct` | `A128_RiparianBuilder`, `A149_HouseArtist`, `B126_Carpenter`, `B013_CarpentersParlor`, `C128_WoodenHutExtender`, `C088_CarpentersApprentice`, `D121_ClayPlasterer`, `E123_ResourceHoarder`, `E150_RockBeater` |
| listener | `computeCosts.fence` | `C016_FieldFences`, `C088_CarpentersApprentice`, `D082_HuntingTrophy`, `E016_BriarHedge` |
| listener | `computeCardCostCandidates.improvement` | `A027_OvenSite`, `A143_Stonecutter`, `A075_LumberMill`, `B095_MasterBricklayer`, `C122_Bricklayer`, `C027_Blueprint`, `C095_BasketWeaver`, `D117_WoodExpert`, `D095_SiteManager`, `D096_Furnisher`, `E109_BraidMaker`, `E027_PiggyBank`, `M093_FarmhandsQuarters` |
| base cost | `getBaseCosts.improvement` | `A020_DoubleTurnPlow`, `B036_Bottles` |
| listener | `computeCosts.improvement` | `D082_HuntingTrophy`, `E123_ResourceHoarder`, `E130_Overachiever` |
| listener | `computeCosts.occupation` | `B109_PaperMaker`, `B155_ArtTeacher` |
| listener | `computeCosts.plow` | `C037_DwellingMound` |
| listener | `computeCosts.renovate-house` | `B128_Plumber`, `D121_ClayPlasterer`, `D013_Trowel`, `D154_ChimneySweep`, `D081_RoofLadder`, `E123_ResourceHoarder` |
| listener | `computeCosts.stables` | `C088_CarpentersApprentice` |
| listener | `computeExchanges.*` | `C062_CookeryExtension`, `M107_PotRoastRecipe` |
| listener | `computeReplace.bake-bread` | `A097_Freshman`, `B026_AgrarianFences` |
| listener | `computeReplace.collect` | `D138_PetLover` |
| listener | `computeReplace.family-growth` | `E151_DeliveryNurse`, `E092_FieldDoctor` |
| listener | `computeReplace.gain` | `C168_AnimalCatcher` |
| listener | `computeReplace.improvement` | `B103_FieldMerchant`, `C140_PackagingArtist`, `D021_Recruitment`, `E024_Ambition` |
| listener | `computeReplace.renovate-house` | `M032_PeatHut` |
| listener | `computeReplace.sow` | `A094_LazySowman`, `B026_AgrarianFences` |
| listener | `during.improvement` | `A055_JunkRoom` |
| listener | `during.place-farmer` | `D112_YoungFarmer`, `E077_Mattock` |
| listener | `immediatelyAfter.*` | `C025_SteamMachine` |
| listener | `immediatelyAfter.collect` | `A108_MushroomCollector`, `A056_Basket`, `C036_ClayDeposit`, `C058_Woodcraft`, `E033_BeaverColony`, `E075_StoneAxe` |
| listener | `immediatelyAfter.construct` | `B132_EstateMaster` |
| listener | `immediatelyAfter.fence` | `A083_ShepherdsCrook`, `B132_EstateMaster` |
| listener | `immediatelyAfter.fencing` | `B132_EstateMaster` |
| listener | `immediatelyAfter.gain` | `A092_AdoptiveParents`, `E033_BeaverColony` |
| listener | `immediatelyAfter.improvement` | `C096_Merchant`, `D026_CarpentersYard`, `E146_Reseller` |
| listener | `immediatelyAfter.plow` | `B132_EstateMaster` |
| listener | `immediatelyAfter.reap` | `B132_EstateMaster` |
| listener | `immediatelyAfter.renovate-house` | `C144_ReedRoofRenovator` |
| listener | `immediatelyAfter.stables` | `B132_EstateMaster` |
| listener | `immediatelyAfter.trade-applied` | `C053_GypsysCrock`, `E091_PlowBuilder`, `M069_LeatherSaddle`, `M091_RoutineWork` |
| listener | `isDoable.*` | `A126_MasterWorkman` |
| listener | `isDoable.bake-bread` | `A097_Freshman`, `B026_AgrarianFences`, `B067_HandTruck`, `C060_SmallPottersOven`, `D066_PotterCeramics` |
| listener | `isDoable.collect` | `C051_FishingNet` |
| listener | `isDoable.construct` | `D119_WoodBarterer` |
| listener | `isDoable.family-growth` | `E155_Visionary` |
| listener | `isDoable.fence` | `B094_StockProtector`, `C088_CarpentersApprentice`, `D119_WoodBarterer`, `D082_HuntingTrophy`, `E074_AshTrees` |
| listener | `isDoable.fishing` | `C051_FishingNet` |
| listener | `isDoable.improvement` | `B103_FieldMerchant`, `B075_WoodWorkshop`, `C140_PackagingArtist`, `D021_Recruitment` |
| listener | `isDoable.lessons` | `B093_Confidant` |
| listener | `isDoable.lessons-3` | `B093_Confidant` |
| listener | `isDoable.lessons-4` | `B093_Confidant` |
| listener | `isDoable.occupation` | `B093_Confidant`, `D152_Patron`, `D049_Bookshelf`, `E101_Blighter` |
| listener | `isDoable.place-farmer` | `E125_DelayedWayfarer` |
| listener | `isDoable.renovate-house` | `A087_Conservator`, `D014_HammerCrusher`, `M032_PeatHut` |
| listener | `isDoable.sow` | `A065_SeedPellets`, `A094_LazySowman`, `B113_PatchCaregiver`, `B141_FieldCaretaker`, `B026_AgrarianFences`, `B068_Beanfield`, `B072_LoveforAgriculture`, `C112_Thresher`, `C070_LettucePatch`, `D017_DrillHarrow`, `D025_WitchesDanceFloor`, `D075_WoodField`, `E068_CherryOrchard`, `E069_MelonPatch`, `E070_CropRotationField`, `E072_ArtichokeField`, `E080_RockGarden` |
| specialKind | `add-farmyard-space-state` | `M070_MoorArchaeology`, `M092_AridField`, `M095_FallowFields`, `M096_FallowLand`, `M111_NoTillFarming` |
| specialKind | `add-resource-to-space` | `C130_OutskirtsDirector`, `C093_InnerDistrictsDirector`, `D101_SugarBaker` |
| specialKind | `build-stable-on-first-empty-tile` | `E148_Lazybones` |
| specialKind | `card-field` | `C008_PlantFertilizer` |
| specialKind | `choice` | `B146_Illusionist`, `C104_Collector`, `C146_WorkshopAssistant`, `D023_PioneeringSpirit` |
| specialKind | `claim-farmyard-goods-tokens` | `M092_AridField`, `M096_FallowLand` |
| specialKind | `claim-field-goods-tokens` | `M095_FallowFields` |
| specialKind | `clear-pending-fence-bonus` | `E074_AshTrees` |
| specialKind | `consume-pending-extra-turns` |Universal pending extra-turn consumption (C25, etc.)|
| specialKind | `consume-fence` | `C001_Overhaul` |
| specialKind | `consume-supply-token` | `M070_MoorArchaeology` |
| specialKind | `emit-card-triggered` | `A092_AdoptiveParents` |
| specialKind | `field` | `C008_PlantFertilizer` |
| specialKind | `grain` | `E112_GrainThief` |
| specialKind | `grow-field-and-non-field-crops` | `M112_PeatAshFertilizer` |
| specialKind | `increment-counter` | `B132_EstateMaster`, `C132_TimberShingleMaker` |
| specialKind | `increment-extra-data` | `C104_Collector`, `D134_OysterEater`, `D092_ChildOmbudsman`, `E038_RodCollection` |
| specialKind | `move-resource-between-spaces` | `E166_Roastmaster` |
| specialKind | `plant-additional-good` | `C008_PlantFertilizer` |
| specialKind | `pop-card-stack-top` | `E103_Wolf` |
| specialKind | `promote-first-newborn` | `A092_AdoptiveParents` |
| specialKind | `remove-field-crop` | `C063_CraftBrewery` |
| specialKind | `remove-field-crops` | `C057_Crudite` |
| specialKind | `remove-future-meeples` | `B076_Ceilings` |
| specialKind | `record-scoring-reserve-bonus` | `A136_DrudgeryReeve`, `C133_Soldier` |
| specialKind | `resource-quantity-select` | `B157_Salter` |
| specialKind | `resourceExchange` | `E005_NightLoot` |
| specialKind | `return-card-to-board` | `C060_SmallPottersOven` |
| specialKind | `set-counter` | `A144_Sequestrator`, `B048_ForestStone`, `C148_MudWallower`, `D158_BeanCounter` |
| specialKind | `set-extra-data` | `A068_AsparagusGift`, `A073_AgriculturalFertilizers`, `A092_AdoptiveParents`, `A177_Middleman`, `B124_Trimmer`, `B132_EstateMaster`, `B137_Wholesaler`, `B021_HayloftBarn`, `B034_SpecialFood`, `B048_ForestStone`, `B055_MaintenancePremium`, `B093_Confidant`, `C150_ParrotBreeder`, `C016_FieldFences`, `C048_Farmstead`, `C053_GypsysCrock`, `D156_RetailDealer`, `D036_BreedRegistry`, `D056_FatstockStretcher`, `D074_RoyalWood`, `E148_Lazybones`, `E149_MidnightFencer`, `E051_WhaleOil`, `E053_BoarSpear`, `E058_LunchtimeBeer`, `E085_MasterTanner`, `E091_PlowBuilder`, `M091_RoutineWork` |
| specialKind | `set-flag` | `A130_MummysBoy`, `A153_PigOwner`, `A017_ReclamationPlow`, `A018_WheelPlow`, `A045_FireProtectionPond`, `A097_Freshman`, `B124_Trimmer`, `B140_FarmyardWorker`, `B154_SheepKeeper`, `B163_Pastor`, `B024_Lasso`, `B034_SpecialFood`, `B035_HookKnife`, `B076_Ceilings`, `B085_FarmHand`, `C101_StallHolder`, `C143_StoneBuyer`, `C150_ParrotBreeder`, `C042_RavenousHunger`, `C046_Mandoline`, `C051_FishingNet`, `C064_CornSchnappsDistillery`, `C084_PerennialRye`, `C085_DenBuilder`, `C087_Mason`, `C094_StableCleaner`, `D122_ClayCarrier`, `D150_GodlySpouse`, `D157_PartyOrganizer`, `D027_Retraining`, `D046_PelletPress`, `D053_TeaHouse`, `D087_MasterBuilder`, `D093_SheepInspector`, `E013_StoneHouseReconstruction`, `E146_Reseller`, `E151_DeliveryNurse`, `E022_GuestRoom`, `E027_PiggyBank`, `E062_SourDough`, `E091_PlowBuilder`, `E092_FieldDoctor` |
| specialKind | `set-infobox` | `A017_ReclamationPlow`, `B021_HayloftBarn`, `B048_ForestStone`, `B055_MaintenancePremium`, `C115_Sower`, `C148_MudWallower`, `D126_FieldCultivator`, `D036_BreedRegistry`, `E110_Dentist`, `E022_GuestRoom`, `E027_PiggyBank`, `E051_WhaleOil`, `E074_AshTrees` |
| specialKind | `stone` | `C006_StoneClearing` |
| specialKind | `swap-improvement-with-board` | `D027_Retraining` |
| specialKind | `vegetable` | `A113_HeresyTeacher` |

## 11. Source exclusions

| Source | Reason |
|---|---|
| `C054_MarketStall` | `C054_MarketBooth`the reference legacy source files.|
| `C071_SlurrySpreader` | `C071_Slurry`the reference legacy/misnamed source files.|
| `D011_LawnFertilzer` | `D011_LawnFertilizer`the reference typo source files.|
| `E132_Shearer` | `E132_VeggieLover`the reference legacy source files.|
| the reference `implemented=false`Cards with no runtime behavior|Excludes behavioral alignment scope unless OA is explicitly implemented as a product extension.|

## 12. Per-card appendix

Status values are `Aligned`, `Accepted difference`, `Needs review`, and `Excluded`.

`Needs review` means the implementation is not yet aligned: a known the reference difference or high-confidence behavior risk must be fixed or covered by additional tests before the row becomes `Aligned`. It is not an accepted difference.

| Card | Status | Notes |
|---|---|---|
| `M015_PeatBurnOff` | Aligned |onBuy gets 1 fuel, and can replace 1 visible moor with field according to the moor-to-field adjacency rule.|
| `M016_ClearFelling` | Aligned |Prefix at most 3 forests; onBuy gets 2 wood, and can change up to 2 visible forests to moor.|
| `M017_Reforestation` | Aligned |onBuy places 1 forest in the unused farmyard.|
| `M021_PeatCuttingExpedition` | Aligned |Pays 4 food; removes any visible moors, giving 2 fuel and 1 bonus VP each; gives 1 additional fuel for every 2 horses.|
| `M023_EdgeOfTheForest` | Aligned |onBuy uses the terrain-adjacency helper to count fenced forest-field edge to get food and fenced forest-moor edge to get fuel; repeated fence segments will not be counted repeatedly.|
| `M033_NightPasture` | Aligned |Hosted Card Animal Zone provides owner 3 mixed capacity and each non-owner 1 mixed borrowed zone; animal storage is written to the card owner's`animalCountsByZone`, statistics, payment, reorg are settled by animal owner, but zone settings`breedingOwnerPlayerId=owner`, the breeding phase is only counted towards the card owner;`computeHarvestBreedOrderPriority`Let the owner be consistently ranked behind other players.|
| `M034_HomeWood` | Aligned |Give each visible forest grid 1 non-sheep animal capacity through farm-position backed card animal zone; after the zone disappears, the animals are released and normal animal reorg is discarded/rearranged.|
| `M035_HorseTrough` | Aligned |The farm-position backed card animal zone provides up to 2 horse capacity in the unused grid adjacent to the house; the grid continues to be calculated as unused, and multiple candidate zones pass`exclusiveCardZoneLimit`Limiting only 1 in use at a time, both reorg and final total capacity searches respect this limit.|
| `M036_PeatMoss` | Aligned |no visible moors front; wooden house construction cost through construct`scope:'unit'`The trade modifier reduces it to 3 wood + 1 reed per room.|
| `M037_BuildingPlan` | Aligned |After building at least 2 rooms at a time, you can choose to`trueAction:false`Build up to 2 free stables.|
| `M038_NatureReserve` | Aligned |onBuy passed`fencePolicy`Free to surround a grid containing visible/Covered terrain and adjacent to an existing pasture; the terrain will only be recorded on this card before it is fully cleared`cardStates`, it will be converted into a normal pasture after being cleared; the field formed by Slash and Burn will not be converted into a pasture.|
| `M039_SpecialPasture` | Aligned |onBuy passed`fencePolicy.connectionPolicy:'allowDisconnected'`Enclose 1 single cell that is not adjacent to an existing pasture for free, and is limited to 4 fences; subsequent ordinary fences will still use the default connection rules.|
| `M040_MoorFire` | Aligned |2 moors ahead; anytime moor-to-field flow is exposed only when 1 visible moor remains.|
| `M041_CattleCollar` | Aligned |round 8+ front; after Farmland/Cultivation/Slash and Burn, if there is cattle, optional additional`plow`. |
| `M042_DeepPlow` | Aligned |2 improvements in front; 1 moor can be placed in onBuy; 1 moor can be replaced with field according to adjacency rules after using Farmland / Cultivation.|
| `M043_WildFields` | Aligned |onBuy provides up to 2 optional plows, use`adjacencyPolicy:'notAdjacentToFields'`Only non-adjacent fields are allowed; subsequent normal plows will still be adjacent by default.|
| `M044_Swamp` | Aligned |Prefix round <= 4; onBuy reserves an optional moor future terrain token of round 12.|
| `M045_TreeNursery` | Aligned |no improvements prefix; onBuy reserves optional forest future terrain token for round 12 / 13.|
| `M046_Thicket` | Aligned |4 visible forests are in front; onBuy can select up to 2 visible forests and place 1 visible forest on them, and the original terrain is used as Covered Farm Terrain; Slash and Burn are not available, and Fell Trees removes the top and reveals the covered terrain without triggering the cleared-space token.|
| `M047_BogForest` | Aligned |3 improvements front-end; onBuy can select any number of visible moors and place 1 visible forest on them. The original moor is used as Covered Farm Terrain; the covered moor does not participate in visible moor, Cut Peat or Slash and Burn, and is revealed after Fell Trees.|
| `M048_ForestSwamp` | Aligned |After Cut Peat, the optional forest future terrain token of current round + 4 will be reserved. If it exceeds round 14, no reservation will be made.|
| `M049_SurveyorsMap` | Aligned |Prefix round <= 2; onBuy reserves round 11 field, round 12 moor, round 13 forest future terrain token.|
| `M050_FarmExtension` | Aligned |onBuy places an adjacent 2-square farmyard extension on the outer edge of the original 3x5 farm through farm-position selection; the new square is written`player.farmyardExtensions`, subsequent used/unused, plow, fence, terrain, scoring and FarmBoard are all read according to the real coordinates; subsequent expansion cannot continue along the expanded grid.|
| `M051_MoorEnclosures` | Aligned |Clay house front; onBuy places 2 adjacent farmyard extensions on the outer edge of the original 3x5 farm, and places 1 visible moor on each new grid; session test covers extension, moor occupation, illegal overlap rejection and prohibits continued expansion along the M050/M051 expansion grid.|
| `M054_AgriculturalImplement` | Aligned |After Farmland / Cultivation, you can get a face-up special action card; the market card is free, and the opponent's face-up card pays 2 food.|
| `M055_ToolShed` | Aligned |Once per round, Cut Peat / Slash and Burn can be followed by another special action without moving additional workers or special action cards.|
| `M057_Taps` | Aligned |use`contributeExtraTurn` / `countExtraTurns`In the work phase, when ordinary workers are exhausted and special action cards are available, contribute an extra-turn provider; if other providers such as A92 are available at the same time, use one-shot trigger-select on the first layer to only display the provider card, and select M057 before entering Moor special choice`take-card-action`And execute the card completely, retain 0/2 food cost, before listener and after listener / follow-up hook order, the choice option carries card / terrain tile / borrowed-cost preview to distinguish multiple candidates of the same action, and use`cardStates[M057_Taps].extraData.usedThisRound`Prevent the same work phase from being triggered repeatedly;`undoAction` / `undoStep`Return to extra-turn actionStart after passing the universal`startPendingExtraTurnIfAny`Rebuild the provider offer to cover the cancellation scenario of borrowing the opponent's face-up special action; the front end is under M057 pending choice`card-action:*`option maps back to SpecialActionsPanel / FarmBoard clicks, without flattening all candidates into InteractionBar buttons.|
| `M058_PeatFertilizer` | Aligned |2+ fields in front; normal can be selected after Cut Peat`sow`, reuse sow farm interaction.|
| `M059_NaturesFertilizer` | Aligned |Slash and Burn or small improvement after replacing moor with field, the option is only available in the new field sow; passed`allowedFields:'fromSelectedFields'`Also exclude plain old fields and card fields.|
| `M060_SowingMachine` | Aligned |1 horse in front; after any FoM special action, if there are 2+ horses in the end, it is optional`sow`; The Horse Market path is rechecked based on the horse count after animal reorganization; Black Market / Illicit Work freezes the listener list before follow-up, and the newly purchased follow-up card will not trigger the same special action retroactively.|
| `M061_HayWagon` | Aligned |2 horses front; optional after taking wood 3 / clay 3 / reed 2 / stone 2 from accumulation space`trueAction:false`Build Rooms or Renovation, no additional workers are consumed.|
| `M066_LandParcel` | Aligned |Front at most 2 improvements; put 1 forest in onBuy; count as +2/-1/-3 card bonus VP based on unused farmyard spaces 1/2/3+.|
| `M103_ForestKindergarten` | Aligned |Prefix at most 3 forests; after family-growth listener is given to food according to the visible forest count, covering family growth with or without houses, and non-family-growth is not triggered.|
| `M088_PeatIron` | Aligned |Harvest begins with at least 2 visible moors for 1 fuel; less than 2 does not trigger.|
| `M089_BirthingHouse` | Aligned |Family Growth with/without room will get 1 fuel, 1 food, and 1 bonus VP; non-family-growth actions will not trigger.|
| `M090_WinterStorehouse` | Aligned |onBuy initializes 3 usage counters; consumes 1 counter at any time and replenishes fuel/food to at least 2; it is not exposed when the counter is exhausted or does not need to be replenished.|
| `M091_RoutineWork` | Aligned |harvest-local Logbook Harvest craft building that has been used to exchange building resources for food; each unused craft building at the end of feeding can choose 1 fuel or 1 food.|
| `M098_FishSmokehouse` | Aligned |After Fishing collect, you can optionally pay 1 fuel to get 3 food; if there is no fuel, optional pending will not appear.|
| `M125_HardwareStore` | Aligned |onBuy initializes 3 usage counters; consumes 1 counter at any time, and obtains 1 of each building resource that is currently 0; there is no gap or no exposure when the counter is exhausted.|
| `M126_CooperativeStore` | Aligned |onBuy initializes 4 usage counters; consumes 1 counter and 1 building resource at any time, and replaces it with any other non-stone building resource; the counter is not exposed when it is exhausted or has no payable resources.|
| `A001_Shelter` | Aligned |  |
| `A002_ShiftingCultivation` | Aligned |  |
| `A003_PaperKnife` | Accepted difference |schema-up prerequisite / isBuyable metadata difference|
| `A004_Baseboards` | Aligned |  |
| `A005_ClayEmbankment` | Aligned |  |
| `A006_StorageBarn` | Aligned |  |
| `A007_GardenersKnife` | Aligned |  |
| `A008_FoodBasket` | Aligned |  |
| `A009_YoungAnimalMarket` | Aligned |  |
| `A010_WoodenShed` | Aligned |  |
| `A011_MudPatch` | Aligned |  |
| `A012_DrinkingTrough` | Aligned |pasture capacity additive go`computePastureCapacityModifiers`, applied after replacement.|
| `A013_RenovationCompany` | Aligned | the reference `formatCost([])`pass`renovate-house` `actionContext.exactCost`Express free renovation.|
| `A014_CarpentersHammer` | Accepted difference |the reference banned, but OA retained according to product policy|
| `A015_CarpentersAxe` | Aligned |  |
| `A016_RammedClay` | Aligned |fence clay-for-wood walk`scope:'unit'`trade, first generate the reference`addCost`clay cost row, and then allow D88 and other bonus choices to continue to replace.|
| `A017_ReclamationPlow` | Aligned |  |
| `A018_WheelPlow` | Aligned |  |
| `A019_Handplow` | Aligned |  |
| `A020_DoubleTurnPlow` | Aligned | the reference `getBaseCosts()`Align to`CardImpl.getBaseCosts()`, generated before entering the card-purchase pipeline when round > 3`{grain:1, food:1}`base candidate; no longer used`computeCosts.improvement`modifier expression.|
| `A021_FamilyFriendHome` | Aligned |  |
| `A022_Telegram` | Aligned |The skip/use session path of turn-start optional extraPlacement has been covered, and the behavior is equivalent to the the reference flag and then merged into the placement option.|
| `A023_StoneCompany` | Aligned |  |
| `A024_ThreshingBoard` | Aligned |  |
| `A025_Bassinet` | Aligned |  |
| `A026_SleepingCorner` | Aligned |  |
| `A027_OvenSite` | Aligned |use prerequisite instead`fireplaceIdentity` / `cookingHearthIdentity`played-card capability; A060_OrientalFireplace is no longer directly enumerated. During the onBuy period, the fixed price of 1 clay + 1 stone purchased from Clay/Stone Oven will be changed to card-purchase candidate replacement, and the printed oven cost candidate will not be retained.|
| `A028_ForestSchool` | Aligned |  |
| `A029_AleBenches` | Aligned |  |
| `A030_BakingSheet` | Aligned |  |
| `A031_DebtSecurity` | Aligned |  |
| `A032_Manger` | Aligned |  |
| `A033_BigCountry` | Accepted difference |the reference banned, but OA retained according to product policy|
| `A034_Loppers` | Aligned |  |
| `A035_SwimmingClass` | Aligned |  |
| `A036_FacadesCarving` | Aligned |  |
| `A037_Bucksaw` | Aligned |  |
| `A038_WoolBlankets` | Aligned |  |
| `A039_Chapel` | Accepted difference |the reference banned, but OA retained according to product policy|
| `A040_PottersYard` | Aligned |  |
| `A041_VegetableSlicer` | Aligned |  |
| `A042_ForestLakeHut` | Aligned |  |
| `A043_FarmyardManure` | Aligned |  |
| `A044_PondHut` | Aligned |  |
| `A045_FireProtectionPond` | Aligned |  |
| `A046_ClawKnife` | Aligned |  |
| `A047_Trellises` | Aligned |  |
| `A048_ShavingHorse` | Accepted difference |the reference banned, but OA retained according to product policy|
| `A049_NestSite` | Aligned |  |
| `A050_MilkJug` | Aligned |  |
| `A051_DriftNetBoat` | Aligned |  |
| `A052_ThrowingAxe` | Aligned |  |
| `A053_Claypipe` | Aligned |  |
| `A054_Credit` | Aligned |  |
| `A055_JunkRoom` | Aligned |  |
| `A056_Basket` | Aligned |  |
| `A057_MilkingParlor` | Aligned |  |
| `A058_AsparagusKnife` | Aligned |  |
| `A059_PotatoRidger` | Aligned |  |
| `A060_OrientalFireplace` | Aligned |  |
| `A061_WinnowingFan` | Aligned |  |
| `A062_BeerKeg` | Aligned |  |
| `A063_DutchWindmill` | Aligned |  |
| `A064_BarleyMill` | Aligned |  |
| `A065_SeedPellets` | Aligned |  |
| `A066_FeedingDish` | Aligned |  |
| `A067_CornScoop` | Aligned |  |
| `A068_AsparagusGift` | Aligned |  |
| `A069_LargeGreenhouse` | Aligned |  |
| `A070_LiftingMachine` | Aligned |  |
| `A071_ClearingSpade` | Aligned |  |
| `A072_CalciumFertilizers` | Aligned |  |
| `A073_AgriculturalFertilizers` | Aligned |  |
| `A074_StableTree` | Aligned |  |
| `A075_LumberMill` | Aligned |The improvement wood discount uses card-purchase candidate derivation; the resolver layer retains the original candidate and appends the sourced discounted candidate, and the payment layer uses dominance to hide the strictly disadvantaged original price payment item.|
| `A076_Cob` | Aligned |  |
| `A077_Hod` | Aligned |  |
| `A078_Canoe` | Aligned |  |
| `A079_GardenHoe` | Aligned |  |
| `A080_StoneTongs` | Aligned |  |
| `A081_InterimStorage` | Aligned |  |
| `A082_WorkCertificate` | Accepted difference |the reference banned, but OA retained by product policy; runtime uses shared partial-take helper to remove resources from accumulation space|
| `A083_ShepherdsCrook` | Aligned |  |
| `A084_Silage` | Aligned |  |
| `A085_Homekeeper` | Aligned |  |
| `A086_AnimalTamer` | Aligned |  |
| `A087_Conservator` | Aligned |  |
| `A088_HedgeKeeper` | Aligned |  |
| `A089_StablePlanner` | Aligned |  |
| `A090_PlowDriver` | Aligned |  |
| `A091_ShiftingCultivator` | Aligned |  |
| `A092_AdoptiveParents` | Aligned |the reference pull model: When the player runs out of ordinary workers but still has unactivated descendants`contributeExtraTurn`Contribute extra-turn provider, expand after selection use/forfeit or stuck extra-turn flow; stacked/beyond-player-count skip per-source opportunity consumption, failed/auto-resolved/pending-context target rollback by placedWorkerId, forfeit visible log, multiple newborn / adult-feeding coverage completed|
| `A093_BedMaker` | Aligned |  |
| `A094_LazySowman` | Aligned |  |
| `A095_Angler` | Aligned |  |
| `A096_TaskArtisan` | Aligned |  |
| `A097_Freshman` | Accepted difference |the reference banned, but OA retained according to product policy|
| `A098_StableArchitect` | Aligned |  |
| `A099_FellowGrazer` | Aligned |  |
| `A100_Curator` | Aligned |  |
| `A101_CookeryOutfitter` | Aligned |  |
| `A102_Grocer` | Aligned |  |
| `A103_Portmonger` | Aligned |  |
| `A104_WoodHarvester` | Aligned |  |
| `A105_BarrowPusher` | Aligned |  |
| `A106_SlurrySpreader` | Aligned |  |
| `A107_Catcher` | Aligned |  |
| `A108_MushroomCollector` | Aligned |  |
| `A109_SmallTrader` | Aligned |  |
| `A110_Roughcaster` | Aligned |  |
| `A111_WallBuilder` | Aligned |  |
| `A112_ScytheWorker` | Aligned |Additional gain selection threshold`computeHarvestSelectionThreshold()`;Select the field to increase the count through the Harvest Count modifier, and`harvestCountApplications`record source|
| `A113_HeresyTeacher` | Accepted difference |Accepted Behavior/Product Differences|
| `A114_SeasonalWorker` | Aligned |  |
| `A115_ChiefForester` | Aligned |  |
| `A116_WoodCutter` | Aligned |  |
| `A117_WoodCarrier` | Aligned |  |
| `A118_Treegardener` | Aligned |  |
| `A119_FirewoodCollector` | Aligned |  |
| `A120_ClayHutBuilder` | Aligned |  |
| `A121_ClayPuncher` | Aligned |  |
| `A122_PanBaker` | Aligned |  |
| `A123_FrameBuilder` | Aligned |  |
| `A124_Knapper` | Aligned |  |
| `A125_Priest` | Aligned |  |
| `A126_MasterWorkman` | Aligned |  |
| `A127_Lodger` | Aligned |  |
| `A128_RiparianBuilder` | Aligned |The cross-player construct prompt triggered by Reed Bank overrides undo and then reselects construct to ensure that confirm-player-switch will not be entered repeatedly; the clay/stone discount granted to construct is sourced`scope:'unit'`trade, retain the original construction cost and add the reference`addCost`Candidates for discounts.|
| `A129_Swagman` | Aligned |  |
| `A130_MummysBoy` | Aligned |  |
| `A131_CraftTeacher` | Accepted difference |the reference banned, but OA retained according to product policy|
| `A132_Publican` | Aligned |  |
| `A133_Braggart` | Accepted difference |the reference banned, but OA retained according to product policy|
| `A134_FullFarmer` | Aligned |  |
| `A135_AnimalReeve` | Aligned |  |
| `A136_DrudgeryReeve` | Aligned |the reference sharedScoring provides 0..max sets selection for each target player through all-player before-end select dispatch. After selection, use Scoring Reserve to record wood/clay/stone/reed occupancy and 1/3/5 extra points; real resources are not deducted, and Joinery/Pottery/Basketmaker/C133 reads the remaining scoring resources.|
| `A137_RiverineShepherd` | Aligned |optional extra good partial collect using another accumulation cell, which will deduct the source cell and retain action-space provenance|
| `A138_Harpooner` | Aligned |  |
| `A139_HollowWarden` | Aligned |  |
| `A140_ShovelBearer` | Aligned |  |
| `A141_TurnipFarmer` | Aligned |  |
| `A142_Cordmaker` | Aligned |  |
| `A143_Stonecutter` | Aligned |improvement stone discount`computeCardCostCandidates`Add sourced candidate; construct still uses optional bonus modifier, renovation uses mandatory sourced bonus modifier, and does not retain the original renovation cost branch.|
| `A144_Sequestrator` | Aligned |  |
| `A145_Ropemaker` | Aligned |  |
| `A146_StorehouseSteward` | Aligned |  |
| `A147_AnimalDealer` | Aligned |  |
| `A148_Woolgrower` | Aligned |  |
| `A149_HouseArtist` | Aligned |grant construct's reed discount go sourced`scope:'unit'`trade, retain the original construction cost and add the reference`addCost`Candidates for discounts.|
| `A150_Stagehand` | Aligned |  |
| `A151_Minstrel` | Aligned |  |
| `A152_NightSchoolStudent` | Aligned |  |
| `A153_PigOwner` | Aligned |  |
| `A154_Paymaster` | Aligned |  |
| `A155_Conjurer` | Aligned |  |
| `A156_Buyer` | Aligned |  |
| `A157_Bohemian` | Aligned |  |
| `A158_CulinaryArtist` | Aligned |  |
| `A159_JoineroftheSea` | Aligned |  |
| `A160_Lutenist` | Aligned |  |
| `A161_PatchCaretaker` | Aligned |  |
| `A162_ForestTallyman` | Aligned |  |
| `A163_BuildingExpert` | Aligned |  |
| `A164_WoodWorker` | Aligned |  |
| `A165_PigBreeder` | Aligned |  |
| `A166_Haydryer` | Aligned |  |
| `A167_BreederBuyer` | Aligned |  |
| `A168_AnimalTeacher` | Aligned |  |
| `A169_OffSiter` | Accepted difference |the reference implemented=false; OA is implemented as a 5+ extension. Statistics owner has built major improvement and alsoCountsAs major improvement printed wood/clay/reed/stone cost (including fee cost), after the total number reaches 9+ for the first time, it will be locked to provide 1 extra room capacity.|
| `A170_Hayward` | Accepted difference |the reference implemented=false; OA is implemented as a 5+ extension. The owner can trigger normal fence flow via anytime action during fencing legal without placing workers; the implementation still retains normal fence listener semantics.|
| `A171_Sidekick` | Accepted difference |the reference implemented=false; OA is implemented as a 5+ extension. After the owner releases someone in the board action space, he can optionally pay 1 food, and passes`place-farmer-on-space`Place another available worker in the physical left adjacent action slot and execute the target action; the left neighbor is parsed according to the current player number and the layout coordinates, including round action cards and fixed/expanded action slots, and does not skip undisclosed round slots; target doability is judged by the resources after reserving/paying the 1 food, and reuses flow child doability to cover the hook/listener veto of the target action to avoid having no execution options for the target action after payment; activate cascaded after-place-farmer after each target action is completed listener, continue checking to the left, and stop at no left neighbor, no food, no worker, target occupied / blocked / not open / not executable or`sidekickChain`Visited.|
| `A172_BoatPainter` | Aligned |5+ product expansion implementation: Before the work phase returns home, when Fishing and Traveling Players (including 5-6 expansion slots) are both occupied, choose 1 grain or 2 food.|
| `A173_ClayThief` | Accepted difference |the reference implemented=false; OA is implemented as a 5+ extension. After round start resources are accumulated, if there is clay in hollow-56 and it is not used, optionally mark used / update the infobox, and collect all the current clay in hollow-56; if there is no clay or it is used, it will not be triggered.|
| `A174_MasterHora` | Accepted difference |the reference implemented=false; OA is implemented as a 5+ extension. owner in six 5/6 gray farmer linked extension spaces before release (with card-granted extra`place-farmer`Target selection) optional 1 food -> 1 vegetable; no host executability pre-check after single card payment is performed. If the host action is abnormal and cannot be executed after before flow, it will enter the engine-blocked undo-only state.|
| `A175_HollowGardener` | Aligned |5+ product extension implementation: after collect reads Hollow (including hollow-56) actual clay provenance, 3-5 clay for grain, 6+ clay for vegetable.|
| `A176_Wheelmaker` | Aligned |5+ product expansion implementation: onBuy requires that there is another profession, and the own wood is strictly greater than the total wood of other players. If it is lower than 15, it will be supplemented to 15.|
| `A177_Middleman` | Accepted difference |the reference implemented=false; OA is implemented as a 5+ extension. When typing, place the owner-only 1 stone + 1 food attachment in the current meeple-symbol extension spaces; when the owner subsequently uses the action space accurately, he will receive and clear the space attachment. The linked partner will not receive it implicitly, and the non-owner will not receive it or consume it; the front end only renders the attachment resources serialized by the back end and the owner hover text.|
| `A178_CarpentersBoy` | Aligned |5+ product extension implementation: After the opportunity construct, the owner will be given the same amount of wood according to the number of houses built this time.|
| `A179_MountainShepherd` | Aligned |5+ Product Expansion Implementation: Get 1 sheep after using any Quarry.|
| `A180_AnimalBrander` | Accepted difference |the reference implemented=false; OA is implemented as a 5+ extension. animal-market-56 Each original animal branch is expressed in the local flow; after the owner selects a specific branch and completes the original result, he can pay an additional 1 food to replay the same option. The cattle branch local pay/gain, no independent action will be registered; after accepting, the total payment of 3 food will be 2 cattle, if skipped, only the original result will be retained.|
| `B001_UpscaleLifestyle` | Aligned |Instant renovation sub-action uses current`renovate-house` action id. |
| `B002_MiniPasture` | Aligned | the reference `formatCost([WOOD => 0])` / `miniPasture`by nested`fencePolicy`Express free fence, up to 4 total fences, exactly 1 new 1-square pasture, no walking`fencing`wrapper throws params.|
| `B003_Moonshine` | Aligned |  |
| `B004_WoodPile` | Aligned |  |
| `B005_StoreofExperience` | Aligned |  |
| `B006_ExcursiontotheQuarry` | Aligned |  |
| `B007_Wage` | Aligned |  |
| `B008_MarketStall` | Aligned |  |
| `B009_BeatingRod` | Aligned |  |
| `B010_Caravan` | Accepted difference |the reference banned, but OA retained according to product policy|
| `B011_Feedyard` | Aligned |  |
| `B012_Stockyard` | Aligned |  |
| `B013_CarpentersParlor` | Aligned |Wooden house fixed 2 wood + 2 reed house building cost sourced`scope:'unit'`trade, retain the original construction cost and add the reference`addCost`candidate.|
| `B014_Hawktower` | Aligned |  |
| `B015_CarpentersBench` | Accepted difference |the reference banned, but OA retained according to product policy; The reference`formatCost([WOOD => 1])` / `max` / `benchWood`pass`reserve-fence-bonus` + nested `fencePolicy`Expression: Just build a normal fence, exactly 1 new pasture, 1 free section, and use`paymentBudget: { wood: collectedWood }`Limit the final actual payment of ordinary wood; pass`fencePolicy.promptHintKey`Prompt "Only 1 new pasture available" to the front end; do not register the global`fencing`Discount, avoid and E16/C16 etc.`computeCosts.fence`Overlay again; no longer used`collectedWood + 1`The upper limit of the number of segments can be used to crop legal shapes.|
| `B016_MiningHammer` | Aligned |onBuy uses CardEffect; still listening after renovation`after.renovate-house`And build 1 stable for free|
| `B017_ForestPlow` | Aligned |  |
| `B018_GrasslandHarrow` | Aligned |  |
| `B019_MoldboardPlow` | Aligned |optional extra plow is executed first`plow`, then try again after success`pop-card-stack`;optional skip and go`__skip__`, after accepting`plow`confirm-only and direct`cancel`Rejected by generic guard|
| `B020_ChainFloat` | Aligned |  |
| `B021_HayloftBarn` | Accepted difference |the reference banned, but OA is retained according to product policy; grains obtained through resource exchange have been triggered by provenance helper; empty cards are used by family-growth`hasInactiveWorkerInSupply`, will not expose the flow to strangers when only removed workers are left|
| `B022_WalkingBoots` | Accepted difference |the reference banned, but OA retained by product policy; temporary from-supply worker marked on return`removedFromSupply`, subsequent family-growth supply and the upper limit of family members on the player panel will no longer be included in the token.|
| `B023_FinalScenario` | Aligned |Round 14 action reveal / exclusive gate / clear event has been modeled by the backend authority|
| `B024_Lasso` | Aligned |After any first release, the legal second-placement target is calculated using placement availability; the non-animal market first release is only triggered when there is a legal animal market, and the animal market first release is only triggered when there is any legal target, and the target action is executed through the general target action flow|
| `B025_BreadPaddle` | Aligned |  |
| `B026_AgrarianFences` | Aligned |  |
| `B027_Toolbox` | Aligned |Reexamination found no substantial behavioral differences; after building room/stable/fence, you can buy Joinery/Pottery/Basket, sub-action`trueAction=false` |
| `B028_ForestryStudies` | Aligned |  |
| `B029_CookeryLesson` | Aligned |lessons-3 action space overlay has been aligned by the shared lessons-space helper|
| `B030_WoodPalisades` | Aligned |  |
| `B031_PotteryYard` | Aligned |use prerequisite instead`potteryIdentity`played-card capability; D060_LargePottery is judged by dual-type major identity participation.|
| `B032_Kettle` | Aligned |  |
| `B033_Mantlepiece` | Aligned |desc/cost/vp/prereq/onBuy score alignment; neither the reference/OA nor runtime prohibits renovate logic|
| `B034_SpecialFood` | Aligned |Action animal provenance has converged to`sumActionSpaceMovedToTriggerPlayer()`;Keep the animal check and use the assigned animal caliber instead. Bonus VP is only recorded once and the cumulative value is displayed on the card.|
| `B035_HookKnife` | Aligned |  |
| `B036_Bottles` | Aligned | the reference `getBaseCosts()`Align to`CardImpl.getBaseCosts()`, generated according to the current family size before entering the card-purchase pipeline`{clay:N, food:N}`base candidate; no longer used`computeCosts.improvement`modifier expression.|
| `B037_Grange` | Aligned |  |
| `B038_FutureBuildingSite` | Aligned |  |
| `B039_Loom` | Aligned |  |
| `B040_BreweryPond` | Aligned |  |
| `B041_Hauberg` | Aligned |  |
| `B042_ForestInn` | Aligned |  |
| `B043_Chophouse` | Aligned |  |
| `B044_ChickStable` | Aligned |  |
| `B045_StrawberryPatch` | Aligned |  |
| `B046_ClubHouse` | Aligned |  |
| `B047_HerringPot` | Aligned |  |
| `B048_ForestStone` | Aligned |  |
| `B049_Scales` | Aligned | `after.occupation` / `after.improvement`Use the trigger snapshot helper to determine the balance of professions/improvements when triggered; when playing professions/improvements continuously causes the live count to change, the settlement will still be based on the trigger frame.|
| `B050_ButterChurn` | Aligned |  |
| `B051_DiggingSpade` | Aligned |  |
| `B052_GrowingFarm` | Aligned |  |
| `B053_SculptureCourse` | Aligned |  |
| `B054_Tumbrel` | Aligned |#186 After sow, "1 food per stall" is used instead.`getStableCountForCards`(Includes B85, aligned to the reference`countStablesForCards`) |
| `B055_MaintenancePremium` | Aligned |  |
| `B056_Brook` | Accepted difference |schema-up prerequisite / isBuyable metadata difference|
| `B057_Scullery` | Aligned |  |
| `B058_CrackWeeder` | Aligned |  |
| `B059_FoodChest` | Aligned |  |
| `B060_BrewingWater` | Aligned |  |
| `B061_ThreeFieldRotation` | Aligned |  |
| `B062_Pitchfork` | Aligned |  |
| `B063_Tasting` | Aligned |lessons-3 action space overlay has been aligned by the shared lessons-space helper|
| `B064_MillWheel` | Aligned |  |
| `B065_GrainDepot` | Aligned |wood/clay/stone base paths enter ComputeCardCosts as card-purchase candidates; derived candidates are used after payment in onBuy`originalFeeIndex`Maintaining the original path identity, wood/clay/stone are still ranked 2/3/4 future grains respectively.|
| `B066_SackCart` | Aligned |  |
| `B067_HandTruck` | Aligned |Optional gain grain is used before baking, and then the mandatory bake continuation is retained; it is not triggered when there is no bake provider.|
| `B068_Beanfield` | Aligned |  |
| `B069_PottersMarket` | Aligned |  |
| `B070_NewPurchase` | Aligned |  |
| `B071_HarvestHouse` | Aligned |  |
| `B072_LoveforAgriculture` | Aligned |The capacity of the sown pasture is deducted by the additive pasture capacity modifier; even if B72 is played first, it will be calculated in the modifier order after D11 replacement / A12 additive.|
| `B073_GiftBasket` | Aligned |  |
| `B074_ThickForest` | Accepted difference |schema-up prerequisite / isBuyable metadata difference|
| `B075_WoodWorkshop` | Aligned |Use the general before-reachability opt-in; B75 session overwrites gain wood and then makes small changes, after A48 conversion, makes small changes to food-cost, and when it is still unreachable in the end, engine-blocked / undo-only|
| `B076_Ceilings` | Aligned |  |
| `B077_LoamPit` | Aligned |  |
| `B078_ReedBelt` | Aligned |  |
| `B079_Corf` | Aligned |  |
| `B080_HardPorcelain` | Aligned |  |
| `B081_Handcart` | Aligned |Generated using the shared partial-take helper`collect`leaf, remove 1 resource from accumulation space and record`resource.moved`source|
| `B082_ValueAssets` | Aligned |  |
| `B083_MuddyPuddles` | Aligned |  |
| `B084_AcornsBasket` | Aligned |  |
| `B085_FarmHand` | Accepted difference |FarmHand stable by Farm Expansion`stables` leaf wrapper(`actionContext.farmHand`) into shared stables paid /`farm.stableBuilt`Event/after-stables listener link, cost = 2 wood and takes effect uniformly with discounts such as C88; OA allows the same stables leaf to be mixed to build ordinary stable and FarmHand special stable. Difference: FarmHand position does not advance`stableTiles`(Does not count towards animal zone/loose stable capacity), only after`computeExtraRoomCapacity`+1 housing, stable count caliber by`shared/domain/stables.ts`Derived separately.`farm.stableBuilt`item add`kind: 'normal' \| 'special'`, special belt`sourceCardId`. Return-stable (D102/E76`stable-removal`helper) lists FarmHand as a candidate and clears`extraData.position`, release 1 stable supply, housing capacity returns to 0, but retain`flagged`(once-per-game, no longer offered after recycling), no animal reorganization flow is generated. Front End Wiring (#189 P1-1):`useFarmSelection`add`pendingFarmHand`status (up to 1 special site); FarmBoard converts farm-select's`farmHandPositions`Rendered as clickable target; InteractionBar confirm in`pendingStableTilesLength === 0 && !pendingFarmHand`Disabled (only select FarmHand to confirm); submit after`buildStableCommitPayload`Walk`commitSelection({ stables, farmHand })`. UI candidate/selected state (#199): Candidates are no longer marked in the upper left corner of the 2×2, but are rendered in the center of the 2×2 geometry.`post`cell (pure function`client/components/board/farmHandCenter.ts`Do top-left↔center-post coordinate mapping), use a translucent purple center box overlay (`.farmhand-center-overlay`, hot zone ≈0.7×`--tile`Easy to click, do not grab the outer ring (ordinary stable candidate), click the center classic`toggleFarmHand(top-left)`, select the bold solid box. Established resident state (#200): backend universal card-effect hook`getBuiltSpecialStables(player)`+ aggregation`collectBuiltSpecialStables`Derive snapshot display fields`SerializedPlayerState.specialStables`(Do not enter the top level of the field,`rehydrateState`stripped); frontend`GameContainerApi`from`displayPlayer.specialStables`Derive the built top-left collection and pass it to FarmBoard to post render in the 2×2 center`.farmhand-center-built`Permanent stable icon (no pulsation, no reselection), naturally updated with snapshot - after D102/E76 recycling`specialStables`Empty, overlay disappears. 2026-05-30 UI bugfix: InteractionBar summary counts FarmHand as selected and displays it`Max +`Semantics; farm post parent is no longer used`opacity: 0`Hide itself; in the selected state, only the center box is displayed and the stable icon is not displayed; in the completed state, only the stable icon is displayed and the selection box is not retained;`farm.stableBuilt`Highlight skip`kind:'special'`, avoid highlighting the top-left stored coordinates into ordinary fields. Front-end zero single card coupling (not read`cardStates['B085_FarmHand']`, no import`shared/cards`). |
| `B086_TruffleSearcher` | Aligned |  |
| `B087_Cottager` | Aligned |  |
| `B088_EstablishedPerson` | Aligned | the reference `formatCost([])`pass`renovate-house` `actionContext.exactCost`Express free renovation; follow up with ordinary fence and go directly`fence`. |
| `B089_Groom` | Aligned |  |
| `B090_CooperativePlower` | Aligned |  |
| `B091_AssistantTiller` | Aligned |  |
| `B092_LittleStickKnitter` | Aligned |  |
| `B093_Confidant` | Aligned |onBuy must select one of 2/3/4 future rounds;`isDoable.occupation`Filter by optional occupation payment plans and by`reserveResources`Requires a minimum of 2 real food payout future schedules after career payout;`isDoable.lessons*`When B93 is the only and unpayable profession, veto lessons action space to avoid having no profession to play after occupying the grid; optional after future receive`sow`or`fence`, where the reference`formatCost([WOOD => 1])`by nested`fencePolicy.costPolicy`Explicit expression, and continue to overlay E16 / C16 etc.`computeCosts.fence`Discount.|
| `B094_StockProtector` | Aligned |  |
| `B095_MasterBricklayer` | Aligned |major-only stone discounts`computeCardCostCandidates`, append sourced candidates according to the current number of rooms; minor improvement does not produce candidate pipeline output.|
| `B096_TreeFarmJoiner` | Aligned |future wood expires and goes to universal Future Receive; in the card`after.receive`listener checks the card source wood and adds optional`minor-improvement`, do not write single-card branches in the round-start core path.|
| `B097_Scholar` | Aligned |  |
| `B098_OrganicFarmer` | Aligned |  |
| `B099_Tutor` | Aligned |  |
| `B100_Clutterer` | Aligned |  |
| `B101_FurnitureCarpenter` | Aligned |  |
| `B102_Consultant` | Aligned |  |
| `B103_FieldMerchant` | Aligned |  |
| `B104_SheepWalker` | Aligned |  |
| `B105_CaseBuilder` | Aligned |  |
| `B106_MoralCrusader` | Aligned |  |
| `B107_Manservant` | Aligned |  |
| `B108_OvenFiringBoy` | Aligned |  |
| `B109_PaperMaker` | Aligned |  |
| `B110_Pavior` | Aligned |  |
| `B111_Rustic` | Aligned |  |
| `B112_Silokeeper` | Aligned |  |
| `B113_PatchCaregiver` | Aligned |  |
| `B114_Childless` | Aligned |  |
| `B115_TinsmithMaster` | Aligned |Seeding rewards have been changed to optional farm-position selection, using precise selectableTiles|
| `B116_Shoreforester` | Aligned |  |
| `B117_Informant` | Accepted difference |the reference banned, but OA retained according to product policy|
| `B118_SmallscaleFarmer` | Aligned |  |
| `B119_Lumberjack` | Aligned |  |
| `B120_Sweep` | Aligned |  |
| `B121_Geologist` | Aligned |  |
| `B122_Mineralogist` | Aligned |  |
| `B123_RoofBallaster` | Aligned |  |
| `B124_Trimmer` | Aligned |after fence no longer writes this work phase reward flag; each time the pasture coverage area increases, you can get 2 stone, and the return-home flag still prevents accidental triggering during non-work phases.|
| `B125_EstateWorker` | Aligned |  |
| `B126_Carpenter` | Aligned |Fixed 3 building-resource + 2 reed building cost sourced`scope:'unit'`trade, retain the original construction cost and add the reference`addCost`candidate.|
| `B127_Seducer` | Aligned |  |
| `B128_Plumber` | Aligned |Optional after Major Improvement`renovate-house`leaf with`sourceCard`Trigger; overhaul cost listener read`params.selectedOption`target materials, only mandatory sourced 2 target resource discounts are provided.|
| `B129_Seatmate` | Aligned |4p use`(ownerIdx+⌊n/2⌋)%n`Calculate the opposite seat. Allow-occupied is injected only when the opposite seat does not occupy r13 and the owner himself is not at r13; 3p is injected when any neighboring seat is occupied and the owner himself is not injected at r13; round<13 / other people are not injected. The ordering convention of state.players is consistent with C150_ParrotBreeder.|
| `B130_FullPeasant` | Aligned |  |
| `B131_Equipper` | Aligned |  |
| `B132_EstateMaster` | Accepted difference |the reference banned, but OA retained according to product policy|
| `B133_VillagePeasant` | Aligned |  |
| `B134_HousebookMaster` | Aligned |  |
| `B135_NutritionExpert` | Aligned |  |
| `B136_HouseSteward` | Aligned |  |
| `B137_Wholesaler` | Aligned |#241 Change to card`SPACE_REWARDS`The table generates four action-space listeners, retaining the one-time collection semantics of cardStates.|
| `B138_ForestGuardian` | Aligned |  |
| `B139_ForestScientist` | Aligned |  |
| `B140_FarmyardWorker` | Aligned |  |
| `B141_FieldCaretaker` | Aligned |  |
| `B142_Greengrocer` | Aligned |  |
| `B143_ClayWarden` | Aligned |  |
| `B144_Collier` | Aligned |  |
| `B145_BrushwoodCollector` | Aligned |renovation replacement is a stateless cost alternative and is not set.`choiceAffectsState`; When combined with discounts such as D88, the strictly disadvantaged payment item can be removed by payment dominance pruning.|
| `B146_Illusionist` | Aligned |  |
| `B147_Huntsman` | Aligned |  |
| `B148_PetBroker` | Aligned |  |
| `B149_OpenAirFarmer` | Aligned |pay 3 stable supply token; fixed 2 wood build a 2 grid pasture;`segmentBounds.total.max=6`, B30 palisade is included in the total number of segments and can supplement ordinary fence supply|
| `B150_LargeScaleFarmer` | Aligned |  |
| `B151_LittlePeasant` | Accepted difference |the reference banned, but OA retained according to product policy|
| `B152_JuniorArtist` | Aligned |  |
| `B153_Housemaster` | Aligned |Final score summarizes true major vs.`alsoCountsAs: ['major']`of minor, the A60 single-car classification will no longer be retained.|
| `B154_SheepKeeper` | Accepted difference |schema-up prerequisite / isBuyable metadata difference|
| `B155_ArtTeacher` | Aligned |Career pay available Traveling Players food via cards inside`paymentResourceProviders`Expression; payment solution record`B155_ArtTeacher:traveling-players-food`, click the action food when executing, and no longer use the payment trade sideEffect.|
| `B156_StorehouseKeeper` | Aligned |  |
| `B157_Salter` | Aligned |  |
| `B158_DistrictManager` | Aligned |  |
| `B159_LieutenantGeneral` | Aligned |  |
| `B160_PubOwner` | Aligned |  |
| `B161_Weakling` | Accepted difference |the reference banned, but OA retained according to product policy|
| `B162_ForestClearer` | Aligned |  |
| `B163_Pastor` | Aligned |  |
| `B164_SheepWhisperer` | Aligned |  |
| `B165_GameProvider` | Aligned |1/3/4 grain fields have been limited and selectableTiles are verified before effect|
| `B166_CattleFeeder` | Aligned |  |
| `B167_StableSergeant` | Aligned |onBuy uses the shared final total animal accommodation helper; the payment reward flow will not be played when sheep / boar / cattle cannot be accommodated at the same time.|
| `B168_PastureMaster` | Aligned |  |
| `B169_LivestockSustainer` | Aligned |5+ product expansion implementation: provide mixed animal-holder card zone according to the current number of major identities of other players, including`alsoCountsAs: ['major']`The minor, excluding the owner's own major, the capacity limit is 8, and the capacity is dynamically reduced after the major leaves the site; the animal zone calculation read-only echo`animalCounts`, after animal reorg from general card-zone`animalCounts`To restore each species, the failed storage after the capacity is reset to zero or reduced will be cleaned up when reorg is written back.|
| `B170_CorralBuilder` | Accepted difference |the reference implemented=false; OA is implemented as a 5+ extension. The round start of Pig Market / Cattle Market reveal is triggered independently, and optionally executes B2-style to free exactly 1 pasture non-action fence flow; if one pasture is illegal, there will be no compensation.|
| `B171_GreenhouseBuilder` | Accepted difference |the reference implemented=false; OA is implemented as a 5+ extension. Register owner-only dynamic action space, only those that have been revealed before the current round and are executable by owner`fencing` / `house-redevelopment` / `vegetable-seeds`printed spaces expose corresponding branches.|
| `B172_CattleCaregiver` | Aligned |5+ product expansion implementation: round start counts players who own cattle according to the currently visible and normalized animal zone and animal-holder card zone, and 3/4/5+ people are given 1/2/3 food respectively.|
| `B173_Sweeper` | Accepted difference |the reference implemented=false; OA is implemented as a 5+ extension. The owner uses the meeple-symbol extension space and then puts 1 food on the card through the shared stored-food cashout helper; the one-time anytime cashout removes the food on the card and marks it as used. The occupation is still counted as played and will not be accumulated in the future.|
| `B174_RiverbankGardener` | Aligned |5+ Product Expansion Implementation: Get an additional 1 vegetable after Riverbank Forest collect.|
| `B175_FieldOverseer` | Accepted difference |the reference implemented=false; OA is implemented as a 5+ extension. At the end of the harvest field phase, only other players will be counted.`harvestReapSummary`The number of grain fields in , 3/4/6+ is given to food/grain/vegetable according to the highest threshold.|
| `B176_VillageIdiot` | Accepted difference |the reference implemented=false; OA is implemented as a 5+ extension. by hand/played`occupation.isDoable`and`providesOccupation`minor interception is guaranteed to be and remain a lone occupation, and used in opponent`meeting-place`Then give the owner 1 wood + 1 food.|
| `B177_StoneClawer` | Aligned |5+ product expansion implementation: 1 stone will be given after each successful blow leaf settlement.|
| `B178_TagAlong` | Accepted difference |the reference implemented=false; OA is implemented as a 5+ extension. After the opponent uses the Resource Market variant, the owner can optionally pass`place-farmer-on-space`Put available workers into the same occupied action space and execute the action; it will not trigger when the owner uses it himself, is not Resource Market, has no available workers, or the target is blocked/unexecutable.|
| `B179_WildBoarHunter` | Accepted difference |the reference implemented=false; OA is implemented as a 5+ extension. Press actual before return home`takenBy`Occupancy statistics of wood accumulation spaces, 3+ and the owner has wood, optional 1 wood -> 1 boar.|
| `B180_GameTeaser` | Aligned |5+ product extension implementation: only count the food moved from the food accumulation space itself, 1/2/3 food are given to cattle/boar/sheep respectively, 4+ is not triggered.|
| `C001_Overhaul` | Aligned |the reference passing behavior is handled by improvement host action / pay child / activate-card-effect; rebuild only counts/recycles/rebuilds own ordinary fences, go`consume-fence` ownOnly + generic `fencePolicy` |
| `C002_Stable` | Aligned | the reference `formatCost([WOOD => 0])`pass`stables` `actionContext.exactCost`Express free stable.|
| `C003_CarriageTrip` | Accepted difference |the reference banned, but OA retained according to product policy|
| `C004_WritingBoards` | Aligned |  |
| `C005_Remodeling` | Aligned |  |
| `C006_StoneClearing` | Aligned |the reference passing behavior is handled by improvement host action / pay child / activate-card-effect|
| `C007_BladeShears` | Aligned |  |
| `C008_PlantFertilizer` | Aligned |  |
| `C009_AutomaticWaterTrough` | Aligned |the reference passing behavior is handled by the improvement host action / pay child / activate-card-effect; purchasable animal candidates use the shared final total animal holding helper.|
| `C010_BunkBeds` | Aligned |  |
| `C011_WildlifeReserve` | Aligned |When Farmers of the Moor is enabled, only 1 each of sheep / boar / cattle is allowed, and horse will be rejected by the card-zone invalid-animal check.|
| `C012_CattleFarm` | Aligned |  |
| `C013_WoodSlideHammer` | Aligned |Wood houses with at least 5 rooms directly renovated to stone are discounted by the mandatory sourced bonus modifier, and the original stone renovation cost branch is not retained.|
| `C014_StrawThatchedRoof` | Aligned |construct/renovation pass`CostResourceRemovalModifier`from`fee` / `fees` / `unitFee`Delete reed, and prevent post-cost bonuses such as D013 from being re-added; E123 top reed no longer generates or consumes payment options, and the actual deduction is included in the saved reed of this card.|
| `C015_Trellis` | Aligned | the reference ordinary `FENCING`sub-action mapped to internal`fence` leaf. |
| `C016_FieldFences` | Aligned |Field-adjacent fence discount explicitly declares Cost Attribution and records saved wood according to the number of adjacent fences submitted.|
| `C017_NewlyPlowedField` | Aligned |  |
| `C018_RollOverPlow` | Aligned |By default, discard selection selects at least one crop field. Empty submission or selection of empty fields will not bypass discard and enter plow directly.|
| `C019_SwingPlow` | Aligned |  |
| `C020_MolePlow` | Aligned |  |
| `C021_HeartofStone` | Aligned |  |
| `C022_BasketChair` | Aligned |After recycling the Day Laborer worker, press the linked-occupancy metadata to clean up the synthetic occupancy of the same linked worker, and retain the real/unmatched lessons occupancy|
| `C023_JobContract` | Aligned |lessons fake occupancy write`WorkerRef.synthetic.kind='linked-occupancy'`, source card and linked worker id are both expressed in action-space state|
| `C024_BedintheGrainField` | Aligned |Provided when available next harvest optional`family-growth`, the one-time marker will be cleared after skip/accept; the marker will be consumed even if there is no vacancy.|
| `C025_SteamMachine` | Aligned |The last normal worker returns after using accumulation space`SEQ[optional bake-bread, special-effect.consume-pending-extra-turns]`;The consumption step uses the general pending extra-turn aggregation and does not reference A92. Silent no-op when there is no pending/unpayable; write all when there are multiple pending opportunities`_extraTurnConsumedCount`, and will only be issued by C25 during actual consumption.`card.triggered`. Listener explicitly declared`cardIds`, ensure that trigger-select/source card metadata remains as C25; Card-sourced follow-up leaf passes`sourceCard`Guards avoid the immediateAfter self-triggering loop, and do not treat additional cards as "normal workers' last actions".|
| `C026_Flail` | Aligned |  |
| `C027_Blueprint` | Aligned |Three workshop majors retain the original payment candidates, and add Blueprint stone-discount candidates; the minor-improvement entrance remains`computeChoiceCandidates`In listener mode, the payment option displays the source through candidate metadata.|
| `C028_TeachersDesk` | Accepted difference |the reference banned, but OA retained according to product policy|
| `C029_BeerTable` | Aligned |  |
| `C030_HalfTimberedHouse` | Aligned |  |
| `C031_WritingChamber` | Accepted difference |the reference banned, but OA retained according to product policy|
| `C032_AbortOriel` | Aligned |  |
| `C033_GreeningPlan` | Aligned |  |
| `C034_ElephantgrassPlant` | Aligned |  |
| `C035_LanternHouse` | Aligned |  |
| `C036_ClayDeposit` | Aligned |  |
| `C037_DwellingMound` | Aligned |plow's additional 1 food cost explicitly declares Cost Attribution, and records paid food on this card after successful payment.|
| `C038_Christianity` | Aligned |  |
| `C039_StudioBoat` | Aligned |  |
| `C040_CanvasSack` | Aligned |  |
| `C041_FarmStore` | Aligned |#241 Change to card`REWARD_OPTIONS`Table generation optional pay/gain XOR.|
| `C042_RavenousHunger` | Aligned |Vegetable Seeds and then use placement availability to filter the actual accessible accumulation cells; only create optional second placement if there is a legal target, and the target collect passes`after.collect`flag adds corresponding accumulated resources +1, and unflag after settlement|
| `C043_FarmBuilding` | Aligned |  |
| `C044_ChickenCoop` | Aligned |  |
| `C045_Stew` | Aligned |  |
| `C046_Mandoline` | Aligned |  |
| `C047_GardenClaw` | Aligned |  |
| `C048_Farmstead` | Aligned |  |
| `C049_BeerStall` | Aligned |#186 "Empty unfenced corral" is used instead`getEmptyUnfencedStableCountForCards`(B85 always counts 1 empty, aligned with the reference`getEmptyUnfencedStables`) |
| `C050_StableYard` | Aligned |  |
| `C051_FishingNet` | Aligned |  |
| `C052_HuntsmansHat` | Aligned |cooking prerequisite is aligned with the food path of action-space boar/pig gain; no current OA action-space difference is seen|
| `C053_GypsysCrock` | Aligned |  |
| `C054_MarketBooth` | Aligned |printed cost is 1 stable; harvest exchange pays grain + reserve fence|
| `C055_Studio` | Aligned |  |
| `C056_FeedFence` | Aligned |stable clay-for-wood go`scope:'unit'` trade + `groupMax:1`, only replaces an original 2 wood stable, and can generate the reference first`addCost`Clay cost row was replaced by D88; #186 "4th corral +2 food" bonus caliber was changed to`getStableCountForCards === 4`(Includes B85, aligned to the reference`countStablesForCards()==4`); the number of this construction is still`getStableTilesBuiltThisAction`(Reported to #185)|
| `C057_Crudite` | Aligned |  |
| `C058_Woodcraft` | Aligned |  |
| `C059_SchnappsDistillery` | Aligned |  |
| `C060_SmallPottersOven` | Accepted difference |the reference banned, but OA retained according to product policy|
| `C061_BeerStein` | Aligned |  |
| `C062_CookeryExtension` | Aligned |  |
| `C063_CraftBrewery` | Accepted difference |the reference banned, but OA retained according to product policy|
| `C064_CornSchnappsDistillery` | Aligned |  |
| `C065_Granary` | Aligned |  |
| `C066_EternalRyeCultivation` | Aligned |  |
| `C067_MineralFeeder` | Aligned |Turn start provides optional reorganize first, then press reorganize and then reward the pasture sheep status.|
| `C068_Bookcase` | Aligned |  |
| `C069_LandConsolidation` | Aligned |Passed during extra-crop placement pending`actionContext.extraCropPlacement`Disable anytime to avoid nested swaps|
| `C070_LettucePatch` | Aligned |  |
| `C071_Slurry` | Excluded |the reference implemented=false, there is no runtime alignment target in this round|
| `C072_FestivalPlanning` | Aligned |onBuy is executed first`reap`Private trigger harvests ordinary fields and Card Fields, and then enters optional improvement|
| `C073_SeaweedFertilizer` | Aligned |  |
| `C074_PrivateForest` | Aligned |  |
| `C075_Firewood` | Aligned |according to`fireplaceIdentity` / `cookingHearthIdentity` / `ovenIdentity`trigger and respect`firewoodBuildTrigger:false`;D025_WitchesDanceFloor triggers, D064_BakingCourse / M085_OvenInstallation does not trigger.|
| `C076_WoodCart` | Aligned |  |
| `C077_ClaySupply` | Aligned |  |
| `C078_ReedHattedToad` | Aligned |  |
| `C079_StoneCart` | Aligned |  |
| `C080_RockyTerrain` | Aligned |  |
| `C081_MaterialHub` | Aligned |  |
| `C082_HardwareStore` | Aligned |  |
| `C083_EarlyCattle` | Aligned |  |
| `C084_PerennialRye` | Aligned |  |
| `C085_DenBuilder` | Aligned |  |
| `C086_LivestockFeeder` | Aligned |  |
| `C087_Mason` | Aligned | the reference `CONSTRUCT + formatCost(['max'=>1])`Be true`construct` + `exactCost: { max: 1 }`, the room tile will be placed and will no longer be used.`build-farmhand-room`Virtual room.|
| `C088_CarpentersApprentice` | Aligned |wooden house building -2 wood go sourced`scope:'unit'`trade, retain the original construction cost and add the reference`addCost`Candidates for discounts. 13th–15th fence free zone walk`computeCosts.fence`, doability through free`fencePolicy`Reuse real layout access control. Build Stables`maxSelections`Calculate with count-aware total cost (#191):`stables.ts`of`buildStableFarmSelection`Count count=1..reserve one by one`resolveStableTotalCostWithDiscount`(Same total as settlement, including non-uniform discount of -1 for C88 Block 3/4) +`canAffordTypedFlatCost`, take the maximum affordable number and overwrite`farm.maxSelections`, no longer probe`stableCount:1`Fold and then inject farmyard’s per-unit`costOverride`(The non-uniform discount will give one less building, for example, 1 card-facing stable + 3 wood + C88 should be able to build 2 buildings). The actual discounts for stables 3/4 and fences 13–15 explicitly declare Cost Attribution and record saved wood. total is monotonic to count (each additional wood is ≥+1 wood), and the scan is terminated when the first one is unaffordable.`actionContext.max`(A1 Shelter)/`zoneFilter='pasture-1'`/`exactCost`(C94) paths are not affected.|
| `C089_StableMaster` | Aligned |onBuy of 1 wood stable away`stables`exactCost, raw wood gate is not allowed at the entrance, C88, etc. are allowed.`computeCosts.stables`Discounts stack.|
| `C090_FieldWatchman` | Aligned |  |
| `C091_PlowHero` | Aligned |  |
| `C092_AutumnMother` | Aligned |  |
| `C093_InnerDistrictsDirector` | Aligned |Placing stone and optional additional players have been made optional for the entire paragraph, and skip is no longer mandatory to place stone.|
| `C094_StableCleaner` | Aligned |anytime entrance uses stables preview +`computeCosts.stables`To judge availability, 1 wood + 1 food exactCost can be stacked with stable cost modifiers such as C88.|
| `C095_BasketWeaver` | Aligned |During the onBuy period, the 1 reed + 1 stone fixed price of Basketmaker's Workshop is changed to card-purchase candidate append, the original price candidate is retained, and the source is displayed in the payment option; the fixed-price listener is executed before the ordinary discount in the candidate pipeline to avoid combined source pollution.|
| `C096_Merchant` | Aligned |  |
| `C097_SeedResearcher` | Aligned |  |
| `C098_CubeCutter` | Aligned |  |
| `C099_GardenDesigner` | Accepted difference |the reference banned, but OA retained according to product policy|
| `C100_Butler` | Aligned |  |
| `C101_StallHolder` | Aligned |#186 "Number of unfenced corrals" is used instead`getUnfencedStableCountForCards`(Includes B85, aligned to the reference`countUnfencedStablesForCards`) |
| `C102_TreeGuard` | Accepted difference |the reference banned, but OA retained according to product policy|
| `C103_GreenGrocer` | Aligned |  |
| `C104_Collector` | Aligned |choice request passed`structuredChoicePrefixes`Accept the multi-select value of front-end comma splicing, and then use the card resolver to verify the resource type, deduplication and 6/7/8/9 quantity; GameSession regression test coverage #659.|
| `C105_BasketCarrier` | Aligned |  |
| `C106_PotatoHarvester` | Aligned |  |
| `C107_Baker` | Aligned |  |
| `C108_Layabout` | Aligned |  |
| `C109_SchnappsDistiller` | Aligned |  |
| `C110_HomeBrewer` | Aligned |  |
| `C111_SmallAnimalBreeder` | Aligned |  |
| `C112_Thresher` | Aligned |  |
| `C113_WinterCaretaker` | Aligned |  |
| `C114_SoilScientist` | Aligned |  |
| `C115_Sower` | Aligned |  |
| `C116_FurnitureMaker` | Aligned |  |
| `C117_Legworker` | Aligned |  |
| `C118_WoodCollector` | Aligned |  |
| `C119_SkillfulRenovator` | Aligned |  |
| `C120_AgriculturalLabourer` | Aligned |Gain/receive/reap/exchange conversion grain all trigger the path to obtain clay from the card|
| `C121_ClayKneader` | Aligned |  |
| `C122_Bricklayer` | Aligned |improvement clay discount`computeCardCostCandidates`Add sourced candidate; construct still uses optional bonus modifier, renovation uses mandatory sourced bonus modifier, and does not retain the original clay renovation cost branch.|
| `C123_Freemason` | Aligned |  |
| `C124_StoneImporter` | Aligned |  |
| `C125_Nightworker` | Accepted difference |the reference banned, but OA retained according to product policy|
| `C126_Excavator` | Aligned |  |
| `C127_Lover` | Aligned |  |
| `C128_WoodenHutExtender` | Aligned |The fixed cost of wooden houses is divided into rounds sourced`scope:'unit'`trade, retain the original construction cost and add the reference`addCost`candidate.|
| `C129_SecondSpouse` | Aligned |  |
| `C130_OutskirtsDirector` | Aligned |  |
| `C131_PrivateTeacher` | Aligned |  |
| `C132_TimberShingleMaker` | Aligned |  |
| `C133_Soldier` | Aligned |The owner before-end select provides 0..max for wood/stone selection before the final game; after selection, Scoring Reserve is used to record the occupation and extra points. The real resources are not deducted, and the resource score reads the remaining scored resources.|
| `C134_CowPrince` | Aligned |  |
| `C135_Constable` | Aligned |  |
| `C136_RanchProvost` | Aligned |  |
| `C137_CharcoalBurner` | Aligned |  |
| `C138_AnimalFeeder` | Aligned |  |
| `C139_BasketmakersWife` | Aligned |  |
| `C140_PackagingArtist` | Aligned |  |
| `C141_SheepProvider` | Aligned |  |
| `C142_MarketCrier` | Aligned |  |
| `C143_StoneBuyer` | Aligned |  |
| `C144_ReedRoofRenovator` | Aligned |  |
| `C145_ForestReviewer` | Aligned |  |
| `C146_WorkshopAssistant` | Aligned |onBuy saves the pair key`extraData.pairs`And record the selected resource pair log; after other players renovate, the owner can optionally retrieve a pair, and the resource movement follows the standard`gain`/`resource.moved`Semantics and record used/gained; owner prompt enters/returns action players have confirmed player switching, and the switching boundary is not exposed undo; interaction bar pair selects the resource icon and replaces the needed parameter; Played Cards area from`extraData.pairs`Resource pair stack on the rendering card|
| `C147_Cowherd` | Aligned |  |
| `C148_MudWallower` | Aligned | `held`counter is the current upper limit/number of wild boars on the card; animal reorg's`card:C148_MudWallower`zone displays the actual number of wild boars on the card and can be adjusted in the front-end played-card area; E53, this type of animal redemption determines whether to deduct the card through the one-time Animal Payment Preference held, ordinary action-space / B137 newly obtained wild boars will not deduct the card by mistake held|
| `C149_ResourceRecycler` | Aligned |  |
| `C150_ParrotBreeder` | Aligned |  |
| `C151_SowingDirector` | Aligned |  |
| `C152_Puppeteer` | Aligned |  |
| `C153_PatternMaker` | Aligned |  |
| `C154_TwinResearcher` | Aligned |pair mapping completion hollow / copse-add, etc. The reference action grid coverage|
| `C155_FoodDistributor` | Aligned |  |
| `C156_HoofCaregiver` | Aligned |  |
| `C157_ResourceAnalyzer` | Aligned |  |
| `C158_ForestCampaigner` | Aligned |  |
| `C159_FishermansFriend` | Aligned |  |
| `C160_Outrider` | Aligned |  |
| `C161_PotatoDigger` | Aligned |  |
| `C162_ForestOwner` | Aligned |  |
| `C163_MaterialDeliveryman` | Aligned |  |
| `C164_GermanHeathKeeper` | Aligned |  |
| `C165_GameCatcher` | Aligned |  |
| `C166_CattleWhisperer` | Aligned |  |
| `C167_CattleBuyer` | Aligned |  |
| `C168_AnimalCatcher` | Aligned |  |
| `C169_FastMason` | Accepted difference |the reference implemented=false; OA is implemented as a 5+ extension. After owner collects clay/stone accumulation, optionally perform matching material renovation: clay collection only to clay, stone collection only clay house to stone,`exactCost`Remove reed.|
| `C170_AmateurFencer` | Accepted difference |the reference implemented=false; OA is implemented as a 5+ extension. When onBuy, if the owner has no pasture and one-space fence is legal, you can optionally execute B2-style free exactly 1-space non-action fence flow.|
| `C171_YoungArtist` | Accepted difference |the reference implemented=false; OA is implemented as a 5+ extension. When the returning home phase owner has food and at least one branch is feasible, you can choose to pay 1 food and then perform the Minor Improvement action without workers, or directly draw up to 2 minor improvement cards from the ordinary minor deck; the Minor Improvement branch is judged according to the resources after reserving/paying the 1 food, and will not display branches that cannot buy cards after paying; unfeasible branches are hidden, and there is no keep-one option.|
| `C172_FieldCounter` | Accepted difference |the reference implemented=false; OA is implemented as a 5+ extension. opponent puts 1 food on the card every plow 1 field, press`farm.fieldPlowed.fields`The quantity is accumulated; the owner's own plow is not triggered; cashout reuses the shared stored-food helper.|
| `C173_TopOuter` | Accepted difference |the reference implemented=false; OA is implemented as a 5+ extension. After any player uses house-building-56, the owner collects all the current food of linked traveling-players-56; empty food or non-house-building-56 will not trigger.|
| `C174_StoneCustodian` | Aligned |5+ product expansion implementation: before work phase return home, there are stone accumulation spaces in the statistics, 1 will give 1 grain, 2+ will give 1 vegetable.|
| `C175_VillageTeacher` | Accepted difference |the reference implemented=false; OA is implemented as a 5+ extension. After the owner uses Lessons, 1/2/3 of the actual number of occupied Lessons in the current round is given to food/grain/vegetable; linked blocked cells are not counted.|
| `C176_Cleanacre` | Aligned |5+ product expansion implementation: Farmland/Cultivation/Farming Supplies gives 2 clay after the top-level action is completed; Farming Supplies multi-branch action only triggers once.|
| `C177_MountainHiker` | Aligned |5+ product extension implementation: 5-6 extension accumulation space collect, you can pay 1 food to buy 1 stone; instant-gain extension spaces are not included.|
| `C178_OnSiteReverend` | Aligned |5+ product extension implementation: harvest start forces selection of 1 building resource.|
| `C179_BovinePioneer` | Aligned |5+ product extension implementation: 1 cattle is given when the fence action generates at least 1 newPasture; a fence action is triggered at most once.|
| `C180_Trapper` | Accepted difference |the reference implemented=false; OA is implemented as a 5+ extension. After owner uses wood accumulation, if the actual occupied wood accumulation quantity is 2/3/4, he can choose 1 food to buy sheep/boar/cattle.|
| `D001_ZigzagHarrow` | Aligned |Use generic`plow.actionContext.allowedTiles`Alignment the reference zigzag target limit; accepted divergence: raw zigzag candidates are not pre-filtered out of bounds/occupied, and are ultimately determined by plow validation/`allowedTiles`Intersection processing; empty intersection optional leaf auto-skip|
| `D002_DwellingPlan` | Aligned |Instant renovation sub-action uses current`renovate-house` action id. |
| `D003_Furrows` | Aligned |  |
| `D004_CrossCutWood` | Accepted difference |the reference banned, but OA retained according to product policy|
| `D005_FieldClay` | Aligned |  |
| `D006_PetrifiedWood` | Aligned |  |
| `D007_Trident` | Aligned |  |
| `D008_FernSeeds` | Aligned |  |
| `D009_GameTrade` | Aligned |  |
| `D010_StorksNest` | Aligned |  |
| `D011_LawnFertilizer` | Aligned |size-one pasture replacement go`computePastureCapacityModifiers`;Replace first with`3 * (stables + 1)`, and then add additives such as A12/B72.|
| `D012_MilkingPlace` | Aligned |pass`blocksHouseAnimalZones`metadata trigger`computeAnimalZones()`Universal filtering, D148 is no longer read directly.|
| `D013_Trowel` | Aligned |anytime Renovation directly to stone via`params.selectedOption='stone'`into reality`renovate-house`; wood→stone / clay→stone fixed costs are expressed as sourced mandatory bonus, payment option retains the Trowel source; filter the prohibitive of clay probe`costs`Also carries matching Cost Attribution.|
| `D014_HammerCrusher` | Aligned |  |
| `D015_ClaySupports` | Aligned |  |
| `D016_WoodenWheyBucket` | Aligned | the reference `formatCost(['max' => 1, WOOD => 1])` / `formatCost(['max' => 1])`pass`stables` `actionContext.exactCost`Express sheep market 1 wood, cattle market free, and up to 1 stable.|
| `D017_DrillHarrow` | Aligned |  |
| `D018_SteamPlow` | Aligned |  |
| `D019_PulverizerPlow` | Accepted difference |the reference banned, but OA retained according to product policy|
| `D020_TurnwrestPlow` | Aligned |The payment for purchasing this card will not be recorded as Turnwrest Plow's own PAID; Wood Expert and other card-purchase Cost Attribution will be attributed to the corresponding source card.|
| `D021_Recruitment` | Accepted difference |the reference banned, but OA retained according to product policy|
| `D022_WorkPermit` | Aligned |  |
| `D023_PioneeringSpirit` | Aligned |  |
| `D024_BrotherlyLove` | Aligned |  |
| `D025_WitchesDanceFloor` | Accepted difference |Accepted Behavior/Product Differences|
| `D026_CarpentersYard` | Aligned |  |
| `D027_Retraining` | Aligned |  |
| `D028_WritingDesk` | Aligned |  |
| `D029_MuckRake` | Aligned |  |
| `D030_ArtisanDistrict` | Aligned |  |
| `D031_Storeroom` | Aligned |  |
| `D032_WoodRake` | Aligned |  |
| `D033_SummerHouse` | Accepted difference |the reference banned, but OA retained according to product policy|
| `D034_LuxuriousHostel` | Aligned |  |
| `D035_FodderChamber` | Aligned |  |
| `D036_BreedRegistry` | Aligned |Use zone-aware hand listener to maintain this card when D36 is in hand/played`boardSheep` / `cardSheep` / `sheepConvertedToFood`; Initialize infobox when buying; No Sheep walks the current animal zones.|
| `D037_Sculpture` | Aligned |  |
| `D038_MilkingStool` | Aligned |  |
| `D039_TruffleSlicer` | Aligned |  |
| `D040_Cesspit` | Aligned |  |
| `D041_HorseDrawnBoat` | Aligned |  |
| `D042_EducationBonus` | Aligned |after.occupation Reward changes to trigger snapshot occupation number; E97 When playing additional occupations continuously, resources are released according to the trigger frame of the respective host action.|
| `D043_Hutch` | Aligned |  |
| `D044_ForestWell` | Aligned |  |
| `D045_SheepWell` | Aligned |  |
| `D046_PelletPress` | Aligned |  |
| `D047_Churchyard` | Aligned |  |
| `D048_CivicFacade` | Aligned |  |
| `D049_Bookshelf` | Aligned |  |
| `D050_ForeignAid` | Aligned |  |
| `D051_Archway` | Aligned |  |
| `D052_RollingPin` | Aligned |  |
| `D053_TeaHouse` | Aligned |  |
| `D054_TroutPool` | Aligned |  |
| `D055_NewMarket` | Aligned |  |
| `D056_FatstockStretcher` | Aligned |  |
| `D057_WholesaleMarket` | Aligned |  |
| `D058_Gritter` | Aligned |  |
| `D059_EarthOven` | Aligned |  |
| `D060_LargePottery` | Aligned |  |
| `D061_BaleofStraw` | Aligned |  |
| `D062_BeerTap` | Aligned |  |
| `D063_Lynchet` | Aligned |  |
| `D064_BakingCourse` | Aligned |  |
| `D065_GrainSieve` | Aligned |  |
| `D066_PotterCeramics` | Aligned |Before bake-bread, you can optionally pay 1 clay to get 3 food before listener; reaction dispatch enters trigger-select by default, and the root optional payment flow will be previewed based on the clay inventory to determine whether it is executable.|
| `D067_ReapHook` | Aligned |  |
| `D068_SmallBasket` | Aligned |  |
| `D069_SmallGreenhouse` | Aligned |  |
| `D070_StrawManure` | Aligned |  |
| `D071_Changeover` | Aligned |  |
| `D072_StableManure` | Aligned |Additional gain selection threshold`computeHarvestSelectionThreshold()`;The selected field increases the count through the Harvest Count modifier, and continues to collect the next stack of the same field after the top stack is empty.`harvestCountApplications`Document the source. #186 "Number of unfenced corrals" is used instead`getUnfencedStableCountForCards`(Includes B85, aligned to the reference`countUnfencedStablesForCards`) |
| `D073_SupplyBoat` | Aligned |  |
| `D074_RoyalWood` | Accepted difference |the reference banned, but OA is retained according to product policy; stables payment due to afterHost slot through after-pay provenance statistics|
| `D075_WoodField` | Aligned |  |
| `D076_SocialBenefits` | Aligned |  |
| `D077_RecycledBrick` | Aligned |  |
| `D078_ReedPond` | Aligned |  |
| `D079_CarrotMuseum` | Aligned |  |
| `D080_BrickHammer` | Aligned |Use after-improvement judgment instead`getPrintedImprovementResourceCost(..., 'clay')`; `cost`and`altCosts`It is a base cost candidate, take the largest clay, and no longer add minor`cost.clay`and`altCosts[].clay`Add up.|
| `D081_RoofLadder` | Aligned |Renovation costs 1 reed less and goes sourced mandatory bonus; after.renovate-house still gives 1 stone.|
| `D082_HuntingTrophy` | Aligned |House Redevelopment's improvement discount goes to the mandatory sourced resource choice; Farm Redevelopment's fence discount goes to the sourced action trade up to a total of 3 wood, retaining the original fence cost and adding the reference`addCost`Discount candidate; fence farm-choice settlement will retain the trade and pass it in`pay:fence`. |
| `D083_Pigswill` | Aligned |  |
| `D084_FeedPellets` | Aligned |  |
| `D085_Reader` | Aligned |  |
| `D086_SheepAgent` | Aligned |Capacity deduction passed`animalHolder`metadata + occupation identity filter; D86 itself is still counted in the capacity, and minor animal-holder is not deducted.|
| `D087_MasterBuilder` | Aligned | the reference `CONSTRUCT + formatCost(['max'=>1])`Be true`construct` + `exactCost: { max: 1 }`, the room tile will be placed and will no longer be used.`build-farmhand-room`Virtual room.|
| `D088_Millwright` | Aligned |Use two sequential optional`BonusModifier.choices`Expressed up to 2 times building-resource→grain replacement; applied after unit cost alternative such as A16/C56, retaining the reference combination source; stateless replacement is not set`choiceAffectsState`, can be merged by payment dominance pruning.|
| `D089_Stablehand` | Aligned |  |
| `D090_PlowMaker` | Aligned |  |
| `D091_Plowman` | Aligned |  |
| `D092_ChildOmbudsman` | Accepted difference |the reference banned, but OA retained according to product policy|
| `D093_SheepInspector` | Aligned |  |
| `D094_HenpeckedHusband` | Aligned |  |
| `D095_SiteManager` | Aligned |During the onBuy period, major improvement payment is changed to card-purchase candidate append; for each non-empty subset that already has wood/clay/stone/reed in the current candidate, a "maximum 1 building resource -> 1 food per category" replacement candidate is generated, and the original candidate is retained.|
| `D096_Furnisher` | Aligned | `actionCardId === D096_Furnisher`The improvement appends the wood-discount candidate; the normal improvement does not produce candidate pipeline output; Furnisher saved wood is recorded after selecting the discount candidate; the wood discounted to 0 does not retain the zero value key.|
| `D097_BeggingStudent` | Accepted difference |the reference banned, but OA retained according to product policy|
| `D098_Transactor` | Aligned |  |
| `D099_EarthenwarePotter` | Aligned |  |
| `D100_LordoftheManor` | Aligned |  |
| `D101_SugarBaker` | Aligned |After Grain Utilization, you can optionally pay 1 food to get 1 bonus VP, and pass`add-resource-to-space`Put the food back into Grain Utilization|
| `D102_SampleStableMaker` | Aligned |  |
| `D103_CanalBoatman` | Aligned |  |
| `D104_Cultivator` | Aligned |  |
| `D105_Sculptor` | Aligned |  |
| `D106_WhiskyDistiller` | Aligned |  |
| `D107_Bellfounder` | Aligned |  |
| `D108_StoneCarver` | Aligned |  |
| `D109_SowingMaster` | Aligned |  |
| `D110_FishFarmer` | Aligned |  |
| `D111_InteriorDecorator` | Aligned |  |
| `D112_YoungFarmer` | Aligned |  |
| `D113_FoodMerchant` | Aligned |  |
| `D114_SeedTrader` | Aligned |  |
| `D115_FodderPlanter` | Aligned |  |
| `D116_TreeInspector` | Aligned |  |
| `D117_WoodExpert` | Aligned |Append from each candidate containing wood in the current Cost Candidate List`{wood - 2 clamp 0, food + 1}`sourced candidate; no wood candidate is not derived, continue to support minor`altCosts`; The wood folded to 0 does not retain the zero value key; after selecting the derivation candidate, record the saved wood according to the actual clamp difference, and record the paid food.|
| `D118_Bonehead` | Aligned |  |
| `D119_WoodBarterer` | Aligned |  |
| `D120_ClayDeliveryman` | Aligned |  |
| `D121_ClayPlasterer` | Aligned |Clay house fixed 3 clay + 2 reed house building cost sourced`scope:'unit'`trade, retain the original construction cost and add the reference`addCost`Candidate; renovate to clay to take sourced mandatory bonus, fix clay cost to 1.|
| `D122_ClayCarrier` | Aligned |  |
| `D123_RenovationPreparer` | Aligned |  |
| `D124_Emissary` | Aligned |  |
| `D125_ForestTrader` | Aligned |  |
| `D126_FieldCultivator` | Aligned |  |
| `D127_HardworkingMan` | Aligned |  |
| `D128_BuildingTycoon` | Aligned |  |
| `D129_LumberVirtuoso` | Aligned |  |
| `D130_RecreationalCarpenter` | Aligned |  |
| `D131_CraftsmanshipPromoter` | Aligned |  |
| `D132_HideFarmer` | Aligned |before the end`onBeforeEndGame`optional flow selects 0..max open space, real payment food and writes`hiddenSpaces`; Open space penalty button`farmyard-usage`used tile key deducts limited hiddenSpaces|
| `D133_BeerTentOperator` | Aligned |  |
| `D134_OysterEater` | Aligned |Write card-local skip flag after Fishing;`onBeforePlayerTurn`non-flow skip-control consumes synchronously at the entrance of owner's next labor turn|
| `D135_GardeningHeadOfficial` | Aligned |  |
| `D136_AnimalActivist` | Aligned |  |
| `D137_TradeTeacher` | Accepted difference |the reference banned, but OA retained according to product policy|
| `D138_PetLover` | Aligned |  |
| `D139_Chairman` | Aligned |  |
| `D140_Loudmouth` | Aligned |  |
| `D141_SeedSeller` | Aligned |  |
| `D142_PotatoPlanter` | Aligned |  |
| `D143_TreeCutter` | Aligned |  |
| `D144_WaterWorker` | Aligned |  |
| `D145_RoofExaminer` | Aligned |  |
| `D146_Porter` | Aligned |  |
| `D147_TrapBuilder` | Aligned |  |
| `D148_DomesticianExpert` | Aligned |create`houseAnimalZone`tagged card zone; D12 is no longer read directly.|
| `D149_CasualWorker` | Aligned |  |
| `D150_GodlySpouse` | Aligned |  |
| `D151_SpinDoctor` | Aligned |  |
| `D152_Patron` | Aligned |  |
| `D153_WealthyMan` | Aligned |  |
| `D154_ChimneySweep` | Aligned |When the renovation target is stone, a sourced mandatory 2 stone bonus is provided; ordinary renovation of wood→clay does not produce source-marked no-op candidates.|
| `D155_Ebonist` | Aligned |runtime/display exchange are both harvest window,`sourceId=D155_Ebonist`, no longer exposed as anytime exchange|
| `D156_RetailDealer` | Aligned |  |
| `D157_PartyOrganizer` | Aligned |  |
| `D158_BeanCounter` | Aligned |pass`roundActionOrder` / `getRoundActionSlot()`Determine the real action patterns of rounds 1–8, no longer relying on action definition`roundAvailable`. |
| `D159_ReedSeller` | Excluded |the reference implemented=false; OA retains data-only definitions|
| `D160_Midwife` | Aligned |  |
| `D161_CabbageBuyer` | Aligned |renovation tracker covers renovate-house and subsequent major/minor improvement; card renovation without worker placement directly gives 3f offer|
| `D162_ClayFirer` | Aligned |  |
| `D163_JourneymanBricklayer` | Aligned |  |
| `D164_PetGrower` | Aligned |use`countHouseAnimals()`Statistics of ordinary house zone and tagged house zone, covering D148 house-edge zone.|
| `D165_PigStalker` | Aligned |  |
| `D166_StableMilker` | Aligned |  |
| `D167_PureBreeder` | Aligned |  |
| `D168_Stockman` | Aligned |#186 No. 2/3/4 corral positioning (`nAfter`) use instead`getStableCountForCards`(Includes B85, aligned to the reference`countStablesForCards`); the number of this construction is still`getStableTilesBuiltThisAction`(Reported to #185)|
| `D169_Plowsmith` | Aligned |5+ Product Extension Implementation: After the opponent takes at least 4 wood from the wood accumulation space itself, you can optionally pay 1 food to plow 1 field immediately; including 5/6 Riverbank Forest, non-accumulation source, lower than the threshold or owner has no legal plow tile will not trigger.|
| `D170_FoldBuilder` | Accepted difference |the reference implemented=false; OA is implemented as a 5+ extension. Register all-player dynamic action space; non-owner pays owner 1 food first, then executes forbid-cancel fence flow and gets 1 sheep; owner does not pay for use.|
| `D171_SeniorTeacher` | Accepted difference |the reference implemented=false; OA is implemented as a 5+ extension. Monitor opponent Lessons occupation payment`pay.after`,pass`sumActualPaidResource()`according to`paymentSources`Restore the actual food payment; non-Lessons, owner-pay, and non-food replacement will not be triggered. When actually paying for food, the owner will get exactly 1 food.|
| `D172_PutcherMaker` | Aligned |5+ product expansion implementation: metadata-driven anytime exchange, 1 reed -> 2 food, no upper limit each time.|
| `D173_TownClerk` | Accepted difference |the reference implemented=false; OA is implemented as a 5+ extension. Any player built card`cardCountsAs(..., 'major')`Then put 1 food on the owner card, including`alsoCountsAs: ['major']`minor; ordinary minor does not trigger; cashout reuses shared stored-food helper.|
| `D174_LoessGardener` | Aligned |5+ product expansion implementation: After Clay Pit collect, you can pay 1 food to buy 1 vegetable.|
| `D175_Countryman` | Accepted difference |the reference implemented=false; OA is implemented as a 5+ extension. After any player's renovation-providing action space, the owner can choose to sow exactly one field; non-renovation action-space, card-granted non-renovation space disguise or no legal one field sowing will not be triggered.|
| `D176_Woodshacker` | Accepted difference |the reference implemented=false; OA is implemented as a 5+ extension. In the work phase, if the owner uses wood accumulation for the 1/2 time in this round, he will be given an additional 1/2 clay, which will be counted according to the actual number of uses in this round (reuse of the same space will also count), and will be reset when he returns home.|
| `D177_Graduate` | Aligned |5+ product extension implementation: when onBuy has 1 food, you are forced to pay 1 food; after the payment is successful, you will get 2 stone + 2 reed. If you cannot pay, the reward will not be triggered.|
| `D178_SubstituteTeacher` | Accepted difference |the reference implemented=false; OA is implemented as a 5+ extension. Register owner-only action space. The three visible Lessons will be available after they are actually occupied. The reward is 1 building resource or grain+vegetable.|
| `D179_Bullcatcher` | Accepted difference |the reference implemented=false; OA is implemented as a 5+ extension. Register the owner-only action space. The action spaces corresponding to round slot 3 and round slot 6 are both occupied and the owner still has available workers. After use, you will get 1 cattle + 2 food.|
| `D180_PartTimeWorker` | Accepted difference |the reference implemented=false; OA is implemented as a 5+ extension. after collect reads the data moved to the player from the accumulation space this time`resource.moved`goods map, exact 2/4/6 respectively can optionally return 1/2/3 goods to the grid and obtain sheep/boar/cattle;`return-to-space`leaf from`resource.moved.from.spaceId`Derive and explicitly carry the charged`targetSpaceId`, card-granted placement will also return to the correct grid when collecting non-outer action grids; mixed resources enumerate all legal return combinations, and are combined with other`return-to-space`Optional flow serial coexistence, subsequent resource return is not included in the trigger.|
| `E001_PoleBarns` | Aligned | the reference `formatCost([WOOD => 0])`pass`stables` `actionContext.exactCost`Express up to 3 free stables.|
| `E002_RenovationMaterials` | Aligned | the reference `formatCost([])`pass`renovate-house` `actionContext.exactCost`Expression free renovation to clay.|
| `E003_TeaTime` | Aligned |  |
| `E004_Thunderbolt` | Aligned |  |
| `E005_NightLoot` | Aligned |the reference passing behavior is handled by improvement host action / pay child / activate-card-effect|
| `E006_Recount` | Aligned |  |
| `E007_Pumpernickel` | Aligned |  |
| `E008_FarmersMarket` | Aligned |  |
| `E009_BarteringHut` | Aligned |  |
| `E010_StrawHat` | Aligned |Round 3/6 return-home returns mandatory XOR; the food branch always exists, and the move branch is added when there is a Farmland worker and there is a legal target. move actually removes the Farmland worker and executes the target action flow; moving an existing Farmland worker does not require that there are other available workers at home.|
| `E011_PettingZoo` | Aligned |  |
| `E012_AnimalBedding` | Aligned |  |
| `E013_StoneHouseReconstruction` | Aligned |anytime renovation sub-action uses the current`renovate-house` action id. |
| `E014_WoodSaw` | Aligned |  |
| `E015_NailBasket` | Aligned |  |
| `E016_BriarHedge` | Aligned |use prerequisite instead`getAssignedAnimalsByType()`, house/pasture/stable/animal-holder has the same caliber; fence discount retains this card listener, and records saved wood according to the actual number of submitted border fences.|
| `E017_SkimmerPlow` | Aligned |  |
| `E018_SeedAlmanac` | Aligned |  |
| `E019_OxGoad` | Aligned |  |
| `E020_IronHoe` | Aligned |  |
| `E021_SheepRug` | Aligned |  |
| `E022_GuestRoom` | Accepted difference |Accepted Behavior/Product Differences|
| `E023_Apiary` | Aligned |  |
| `E024_Ambition` | Aligned |  |
| `E025_BumperCrop` | Aligned |onBuy go`reap` private trigger; `2 Grain Fields`Both normal grain fields and card fields with grain are included in the frontend.|
| `E026_Sundial` | Aligned |  |
| `E027_PiggyBank` | Aligned |The flagged free-major payment is changed to card-purchase candidate append, and the free major candidate is added and the original price candidate is retained; the free candidate is executed before the normal discount in the pipeline.|
| `E028_Bookmark` | Aligned |  |
| `E029_Heirloom` | Aligned |  |
| `E030_ChildsToy` | Aligned |  |
| `E031_Upholstery` | Aligned |  |
| `E032_Nave` | Aligned |  |
| `E033_BeaverColony` | Aligned |  |
| `E034_LandRegister` | Aligned |  |
| `E035_Misanthropy` | Aligned |  |
| `E036_HerbalGarden` | Aligned |  |
| `E037_OxSkull` | Aligned |  |
| `E038_RodCollection` | Aligned |  |
| `E039_Paintbrush` | Aligned |  |
| `E040_BeeStatue` | Aligned |  |
| `E041_MuddyWaters` | Aligned |  |
| `E042_WaterGully` | Aligned |  |
| `E043_BarnCats` | Aligned |#186 prerequisite (1 stable) and onBuy's "number of corrals you own" are used instead`getStableCountForCards`(Includes B85, aligned to the reference`countStablesForCards`) |
| `E044_FodderBeets` | Aligned |  |
| `E045_FruitLadder` | Aligned |  |
| `E046_WaterlilyPond` | Aligned |  |
| `E047_SyrupTap` | Aligned |Responded to gain provenance from action-space and prevented self-triggering recursion|
| `E048_TownHall` | Aligned |  |
| `E049_Twibil` | Aligned |  |
| `E050_WildGreens` | Aligned |  |
| `E051_WhaleOil` | Aligned |  |
| `E052_Cubbyhole` | Aligned |  |
| `E053_BoarSpear` | Aligned |The listener only allows the number of newly obtained boars to participate in the exchange; Animal Payment Preference prefer/avoid C148 held by source, C148 source deducts C148, ontology action-space/B137 source preferentially deducts newly obtained non-C148 boar, deline does not change the source|
| `E054_Contraband` | Aligned |  |
| `E055_StoneWeir` | Aligned |  |
| `E056_RomanPot` | Aligned |  |
| `E057_CheeseFondue` | Aligned |  |
| `E058_LunchtimeBeer` | Aligned |  |
| `E059_CombandCutter` | Aligned |  |
| `E060_WorkingGloves` | Aligned |Card Source represents migration; 4 occupation trade modifiers have been moved in`impl.modifiers`, session payment coverage|
| `E061_RaisedBed` | Aligned |  |
| `E062_SourDough` | Aligned |  |
| `E063_IronOven` | Aligned |  |
| `E064_SimpleOven` | Aligned |  |
| `E065_Almsbag` | Aligned |  |
| `E066_BarnShed` | Aligned |Card Source listener represents migration; session covers opponent forest trigger|
| `E067_GrainBag` | Aligned |  |
| `E068_CherryOrchard` | Aligned |Description restore the reference sow/harvest-as-grain semantics, session coverage wood field harvest|
| `E069_MelonPatch` | Aligned |  |
| `E070_CropRotationField` | Accepted difference |Accepted Behavior/Product Differences|
| `E071_CowPatty` | Aligned |Single eligible also uses optional selection, Tada uses precise selectableTiles|
| `E072_ArtichokeField` | Aligned |Card Field only harvests crops in the private field phase; harvest-only 1 food reward is only triggered in the Harvest field phase|
| `E073_Scythe` | Aligned |Record when selected`fullReapPosition`, ordinary reap harvests the entire field through Harvest Count override, and uses`full-field-reap` tag / `field`scope write`harvestCountApplications`;position retained until EndHarvest cleanup|
| `E074_AshTrees` | Aligned |  |
| `E075_StoneAxe` | Aligned |  |
| `E076_LumberPile` | Aligned |  |
| `E077_Mattock` | Aligned |  |
| `E078_SleightofHand` | Aligned |Migrated to atomic batch exchange, covering UI/private/replay|
| `E079_FieldSpade` | Aligned |  |
| `E080_RockGarden` | Aligned |  |
| `E081_AlchemistsLab` | Aligned |  |
| `E082_Profiteering` | Aligned |  |
| `E083_ShepherdsWhistle` | Aligned |  |
| `E084_DollysMother` | Aligned |pass`computeBreedThreshold`Only let harvest-source sheep breeding threshold=1; breed phase directly generates newborn sheep and writes summary, and no longer uses virtual sheep status.|
| `E085_MasterTanner` | Aligned |  |
| `E086_PenBuilder` | Aligned |  |
| `E087_MasterRenovator` | Aligned |  |
| `E088_MasterFencer` | Aligned | the reference `formatCost([WOOD => 0])`by nested`fencePolicy`The expression pays 2/3 wood for up to 3/4 of the total free fence.|
| `E089_Stallwright` | Aligned | the reference `formatCost(['max' => 1])`pass`stables` `actionContext.exactCost`Expression; the 2/3/5/7 professional judgment is changed to read the trigger snapshot, and does not rely on the E97 embedded special judgment or the number of live during execution.|
| `E090_DungCollector` | Aligned |  |
| `E091_PlowBuilder` | Aligned |  |
| `E092_FieldDoctor` | Aligned |  |
| `E093_Motivator` | Aligned |  |
| `E094_Prophet` | Aligned |Instant renovation/fencing sub-action using current`renovate-house` / `fence` action id. |
| `E095_Miller` | Aligned |  |
| `E096_Elder` | Aligned |  |
| `E097_Beneficiary` | Aligned |Additional occupation reserved`params.exactCost: { food: 1 }`;The E89 stable embedded branch has been deleted, and trailing listeners such as E89/D42/B49 are settled by trigger snapshot.|
| `E098_Prodigy` | Aligned |  |
| `E099_UncaringParents` | Aligned |  |
| `E100_MuseumCaretaker` | Aligned |  |
| `E101_Blighter` | Aligned |  |
| `E102_Acquirer` | Aligned |  |
| `E103_Wolf` | Aligned |  |
| `E104_SpiceTrader` | Aligned |  |
| `E105_Pioneer` | Aligned |  |
| `E106_EmergencySeller` | Aligned |  |
| `E107_LandSurveyor` | Aligned |  |
| `E108_BlackberryFarmer` | Aligned |  |
| `E109_BraidMaker` | Aligned |Basketmaker's Workshop's 1 reed + 1 stone fixed price is changed to card-purchase candidate append, retaining the original price candidate and displaying the source in the payment option; the fixed-price listener is executed before the ordinary discount in the candidate pipeline.|
| `E110_Dentist` | Aligned |  |
| `E111_Recluse` | Aligned |  |
| `E112_GrainThief` | Aligned |start selects grain fields; reap writes via Harvest Count modifier`supply-instead-of-field`tag, end field phase read only`harvestCountApplications`,bring`full-field-reap`The same field of tag does not replenish the grain; the extra count of D72 can continue to harvest the next crop after the E112 supply heap replaces the top grain; at the same time, register the selection threshold modifier to reduce the grain field threshold of A112/D72 to 1; end harvest clears selectedPositions|
| `E113_Godmother` | Aligned |  |
| `E114_ShedBuilder` | Aligned |#186 No. 1-4 corral positioning (`nAfter`) use instead`getStableCountForCards`(Includes B85, aligned to the reference`countStablesForCards`); the number of this construction is still`getStableTilesBuiltThisAction`(Reported to #185)|
| `E115_SeedServant` | Aligned |  |
| `E116_FirCutter` | Aligned |  |
| `E117_PipeSmoker` | Aligned |  |
| `E118_KindlingGatherer` | Aligned |  |
| `E119_LandHeir` | Aligned |  |
| `E120_ScrapCollector` | Aligned |  |
| `E121_HillCultivator` | Aligned |  |
| `E122_Cottar` | Aligned |  |
| `E123_ResourceHoarder` | Aligned |after-pay only listens`pay`leaf, and read`resource.paid`The bonusSources / bonusChoiceIndex determines the popup top k; the card's`Bonus.choices`set up`choiceAffectsState:true`, so payment paths using different top-k will not be mutually pruned by dominance pruning. Dynamic payment will write the actual reduction into`PaymentSolution.bonusReductions`, hover stats can display the saved resources of this card; the payment solver no longer changes the values ​​without actual cost changes.`k=0`Skip is recorded as the effective path of this card to avoid duplicate options with reed discounts such as C14; when C14 deletes the reed cost, E123 top reed does not generate a payment path and does not consume the stack. after-pay pop stack / infobox updates via explicit`special-effect`flow execution, keeping reaction preview consistent with live execution.|
| `E124_MayorCandidate` | Aligned |  |
| `E125_DelayedWayfarer` | Aligned |delayed from-supply`isDoable` / `onAllWorkersPlaced`use`hasInactiveWorkerInSupply`, will not expose the release flow when only removed workers are left.|
| `E126_TaxCollector` | Aligned |  |
| `E127_DiligentFarmer` | Aligned | the reference `CONSTRUCT + formatCost(['max'=>1])`Be true`construct` + `exactCost: { max: 1 }`, the room tile will be placed and will no longer be used.`build-farmhand-room`Virtual room.|
| `E128_Saddler` | Aligned |  |
| `E129_Imitator` | Aligned |  |
| `E130_Overachiever` | Aligned |The additional improvement triggered by Wish for Children uses a mandatory resource-choice bonus (10 resource choices), which only reduces 1 selected resource at a time; it is no longer treated as 10 stackable optional bonuses.|
| `E131_MarketMaster` | Aligned |  |
| `E132_VeggieLover` | Excluded |the reference implemented=false, there is no runtime alignment target in this round|
| `E133_ChampionBreeder` | Aligned |  |
| `E134_Omnifarmer` | Aligned |exist`onAfterHarvest`pass`getHarvestOutcome()`Provide a choice of stored goods based on the actual harvested crops / newborn animals this time; recheck outcome, stored goods and current resources when submitting, and no longer read E84 or live thresholds|
| `E135_Pickler` | Aligned |  |
| `E136_AnimalHusbandryWorker` | Aligned | the reference ordinary `FENCING`sub-action mapped to internal`fence` leaf. |
| `E137_FlaxFarmer` | Aligned |  |
| `E138_LivestockExpert` | Aligned |  |
| `E139_BunnyBreeder` | Aligned |  |
| `E140_Carter` | Aligned |collect building resources from action-space determines to use instead`sumActionSpaceMovedToTriggerPlayer()`; triggerRound gating unchanged. |
| `E141_VegetableVendor` | Aligned |  |
| `E142_Smuggler` | Aligned |#241 Change to card`TRADE_OPTIONS`Table generates 2x homogeneous options and retains mixed optional OR subtrees.|
| `E143_Hewer` | Aligned |  |
| `E144_WaresSalesman` | Aligned |according to`waresSalesmanGains`Metadata reads single/multiple gain options and no longer maintains hard-coded improvement id groups.|
| `E145_Parvenu` | Aligned |  |
| `E146_Reseller` | Aligned |  |
| `E147_AnimalDriver` | Aligned |  |
| `E148_Lazybones` | Aligned |Action space reserved marker go`action-space-tokens`Use|
| `E149_MidnightFencer` | Aligned |Round 14 harvest start provides optional real borrowed`fence`leaf; donor cap is based on other players' own ordinary reserves, each with a maximum of 2, skipping or building will no longer generate owed-fence bonus VP; borrowing the fence can undo back to E149 optional, but cannot continue to undo through the round-end boundary|
| `E150_RockBeater` | Aligned |stone house building -2 stone walk sourced`scope:'unit'`trade, retain the original construction cost and add the reference`addCost`Candidates for discounts.|
| `E151_DeliveryNurse` | Aligned |  |
| `E152_BargainHunter` | Aligned |  |
| `E153_StoneSculptor` | Aligned |  |
| `E154_Margrave` | Aligned |  |
| `E155_Visionary` | Aligned |  |
| `E156_ClaypitOwner` | Aligned |The judgment of printed clay is changed to`getPrintedImprovementResourceCost(..., 'clay')`, identifies minor`altCosts`Contains clay as a base cost candidate, and continues to support major simple / complex fee cost.|
| `E157_Usufructuary` | Aligned |  |
| `E158_StoneCustodian` | Aligned |  |
| `E159_OldMiser` | Aligned |  |
| `E160_KelpGatherer` | Aligned |  |
| `E161_ElderBaker` | Aligned |  |
| `E162_Entrepreneur` | Aligned |  |
| `E163_Patroness` | Aligned |  |
| `E164_MountainPlowman` | Aligned |  |
| `E165_MasterHuntsman` | Aligned |  |
| `E166_Roastmaster` | Aligned |  |
| `E167_DairyCrier` | Aligned |  |
| `E168_AnimalTamersApprentice` | Aligned |  |
| `M018_RegisterOfCraftsmen` | Aligned |After playing, choose a payable one from the currently visible Joinery/Pottery/Basketmaker, no one will be allowed to buy it and pay 1 stone less; after passing, it will still be paid by`actionCardId`Scope discount; session test covers hidden stack non-selectable and insufficient resource filtering.|
| `M019_LawnTurf` | Aligned |onBuy press unused farmyard spaces - 2 to get fuel, 4+ improvement prefixed by`prerequisiteCheck`Guard; session test covers reward upper limit and unreachable path.|
| `M020_PeatPellets` | Aligned |onBuy obtains fuel according to the visible moor number, and the major improvement is guarded by metadata in front; session test coverage is public`farmTerrain`count.|
| `M022_EcologicalNiche` | Aligned |onBuy settles food/fuel according to the single most animal species, the single most grown grain/vegetable, and the single most forest/moor; grain/vegetable counts both ordinary fields and card fields; the session test coverage draw does not trigger with card field crops.|
| `M024_BasicSupplies` | Aligned |onBuy will add fuel / food / wood / clay / reed / stone / grain to at least 1; the session test covers the existing resources and does not give them repeatedly.|
| `M025_HouseholdInventory` | Aligned |Requires at least 1 field / pasture / stable, onBuy presses unused farmyard spaces to reed / grain / cattle / stone / vegetable / horse in sequence; session test covers preconditions and reward truncation.|
| `M026_ChimneyHood` | Aligned |onBuy gives food according to the current best bake rate without consuming grain; it is not triggered when the session test covers no baking improvement.|
| `M027_GardenPath` | Aligned |onBuy gives itself 3 wood and exposes the left hand player`publicCardMarkers`Write Garden Path -1 marker; single-player game will not regard owner as its left-hand player; end-game marker enters`cardBonusVp`, FarmBoard is displayed in the original player summary.|
| `M028_OutOnTheWallaby` | Aligned |onBuy is assigned to wood / clay / reed based on the existing Joinery / Pottery / Basketmaker family major; it is not triggered when the session test covers no craft building.|
| `M029_Tinker` | Aligned |Requires 3+ major improvement; only when you have a craft building, onBuy will give 1 each to wood / clay / reed / stone; the session test covers no craft building and can be played but there is no reward.|
| `M030_FarmAnimalMarket` | Aligned |onBuy can optionally pay 2 sheep through exchange to obtain 1 cattle and 1 horse. The placed sheep will be removed from pasture / house / stable / animal-holder simultaneously; when the session test covers no sheep, the selection and placed sheep will not be played.|
| `M031_LivestockMarket` | Aligned |5 animals are pre-executed through inline prerequisite; onBuy enumerates up to 3 sheep / boar / cattle and upgrades and exchanges at the same time, only retaining the shared final total animal accommodation helper to determine the candidates that can be accommodated; candidate filtering is used first`animal-payment.ts`Simulate the cloned player after payment, and then review the accomodability, without reading the C148 private status; trigger the system animal-reorg through ordinary exchange after selection.|
| `M032_PeatHut` | Aligned |Provides 1 point of extra room capacity, heating requirement +1; can replace the Renovation action to add 1 wooden room to the wood house for free. It will only be exposed when there is a legal room tile, and this card will be removed after the house is built successfully; the session test covers capacity, room flow conversion, and the full farm will not withdraw the card.|
| `M052_WeddingCoach` | Aligned |onBuy optionally executes family growth without room restrictions; newborn passes`heldWorkerId`It remains on the card and is released when returning home. It does not occupy the action space and cannot provide subsequent capacity before returning home; the session test covers holding and releasing.|
| `M053_ForestHut` | Aligned |onBuy binds 1 person from supply to the selected visible forest and uses`farmTerrainMarkers`Displayed in the original terrain grid of FarmBoard; remove the forest and optionally place the person in the round, Fell Trees reveal covered terrain or terrain selection, change the binding forest to moor/field will also unlock; return the supply during the return stage, excluding family / housing / feeding / scoring; session and UI testing cover binding, unlocking, non-rotation retention opportunities and marker cleaning.|
| `M056_PeatCuttingRights` | Aligned |1 horse is prefixed; onBuy writes a scheduled Cut Peat offer at +4/+7 in the current round, and it will not be scheduled beyond round 14; consume the token first when it expires, and then optionally execute Cut Peat through the existing Moor special action card verification/fee/turnover process; the token is not retained when it is rejected or there is no moor to clear.|
| `M036_PeatMoss` | Aligned |no visible moors front; wooden house construction cost through active construct`scope:'unit'`Trade modifier reduces to 3 wood + 1 reed per room, covering action-space mobility, single room and multi room payments.|
| `M037_BuildingPlan` | Aligned |after construct reads the action snapshot, it will only be triggered when at least 2 rooms are built this time; optional`trueAction:false`Build up to 2 free stables.|
| `M061_HayWagon` | Aligned |2 horses front; after collect only counts the building resources moved from actionSpace to the player this time. After reaching wood 3 / clay 3 / reed 2 / stone 2, non-worker Build Rooms or Renovation can be selected.|
| `M062_HearthBrush` | Aligned |onBuy will move the Tiled Oven up; from the next round onwards, you can choose to purchase the Tiled Oven after each person action, and the special action will not be triggered; having a Tiled Oven will end with +1; the session test covers not triggering in this round, triggering the person action in the next round, not triggering the special action, resource threshold and supply move-up.|
| `M063_PastoralLetter` | Aligned |onBuy will move the Village Church up; starting from the next round, you can choose to buy the Village Church after each person action, and the special action will not be triggered; Church and Village Church will each get +1; the session test covers the trigger context, supply move-up and scoring.|
| `M064_FamilyBurialPlot` | Aligned |stone house preset; onBuy optionally places blocked farmyard space state in unused farmyard space, which counts as occupation and +1 bonus VP in the end; session test covers accept/skip, blocked occupation and scoring.|
| `M065_FireBrigade` | Aligned |Requires 4+ food and 4+ fuel, onBuy gives 2 food, and pressing 2-5 visible forests gives 1-4 bonus VP; session test covers bonus VP.|
| `M067_ChamberOfCommerce` | Aligned |onBuy gives 1 wood and 1 reed, and the final score is based on the number of Joinery/Pottery/Basketmaker family buildings; the session test covers real-time resources and craft scoring.|
| `M068_Church` | Aligned |Taking possession of Village Church as a prerequisite; removing Village Church from the game instead of returning supply when playing, and getting 2 food; returning home optionally pays 1 fuel each round to get 1 bonus VP; session test covers prerequisite, remove-from-play, instant food and return home stage flow.|
| `M069_LeatherSaddle` | Aligned |Requires 2+ horses; via per-trade`immediatelyAfter.trade-applied`of`preResources`Determine whether there are 3+ horses before each cattle to food transaction occurs, and use immediate`special-effect`The counter gives the same amount of bonus VP; the session test covers real exchange entry, horse threshold and non-cattle are not triggered.|
| `M070_MoorArchaeology` | Aligned |Clay house is in front; after Cut Peat, you can optionally consume 1 fence supply token, and write blocked farmyard space state in the cleared space, which is counted as occupation and the final +1 bonus VP; session test covers optional acceptance, fence supply consumption, blocked occupation and scoring.|
| `M071_BogBody` | Aligned | `computeSharedPostScore`+1 to Museum of the Moors / Living History Museum owners each; 2 points when the same player owns two target cards at the same time, session test covers cross-player sharing of scoring and double target stacking.|
| `M072_OvenDamper` | Aligned |onBuy gives 3 fuel, final press`ovenIdentity`Scores are given for the number of cards played; OA incorporates Oven Installation and existing minor oven identity into the oven-family scoring abstraction, and session testing covers real-time resources, M085 and minor oven identity counting.|
| `M073_StockBreedingPrize` | Aligned |In the final game, points will be awarded based on the number of complete sets of sheep/boar/cattle/horse multiplied by the number of other players, with a maximum of 3 sets; the session test covers multipliers and truncation of the number of players.|
| `M074_Administration` | Aligned |It requires no more than 4 cards in hand; onBuy gives 2 food, round 14 feeding can exchange food for bonus VP according to the upper limit of major quantity; session test covers pre- and delayed selections.|
| `M080_AdvancePayment` | Aligned |onBuy gives 1 each of fuel / food / wood / clay / reed / stone / sheep / grain at one time; the session test covers the complete resource package.|
| `M081_PeatBoat` | Aligned |The metadata anytime exchange supports fuel exchange for wood / clay / reed / stone / sheep / food; the session test covers the registered exact exchange.|
| `M082_Firewood` | Aligned |onBuy gives 1 fuel; in the heating payment, when the current wood-to-fuel conversion is greater than 0, the total demand is -1, and the conversion of wood to fuel is only used as this heating payment, and does not fall into persistent fuel; the discount is deducted according to the demand before discount, and the session test covers dynamic discounts, 1 fuel demand must pay 1 wood, and the original demand of 0 does not create fuel.|
| `M085_OvenInstallation` | Aligned |use`heatingFuelCap: 0`To express that heating is not required; use`ovenIdentity: true`Express the OA oven-family scoring identity and use`firewoodBuildTrigger:false`Avoid upgrade cards triggering C075 Firewood; Heating Oven stack is still expressed by major supply / returnCards metadata; session test covers cap 0, real purchase and returns Heating Oven to FoM stack.|
| `M086_SpinningMill` | Aligned | `1 Sheep`Common prerequisite parser; harvest field phase according to the placed sheep`floor(sheep / 2)`write`cardStates`Heating discount, feeding/heating phase reading; session test covers changes in sheep number.|
| `M091_RoutineWork` | Aligned | `No Improvements`Common prerequisite parser, major/minor will prevent the output; this harvest food craft building passed`resource.exchanged.exchangeSource`Or trade-applied fallback marks used, each unused Joinery / Pottery / Basketmaker family building at the end of feeding can optionally have 1 fuel or 1 food, and FoM Stall is not triggered.|
| `M092_AridField` | Aligned |3 improvements front-end; put fuel+food goods token in the cleared space after Cut Peat, which is still unused; use claim special-effect to release resources and remove token when subsequent cells are occupied by field/room/stable/pasture/blocked state, etc.; session test covers delayed claim.|
| `M093_FarmhandsQuarters` | Aligned |When purchasing a major improvement, you can replace 1 building resource cost with 1 fuel; the right-hand player passes when passing on a minor improvement to himself`card.passed`Provenance gets 1 food, single-player autobiography is not triggered.|
| `M095_FallowFields` | Aligned |onBuy can place field goods tokens in up to 3 empty fields; ordinary sow receives food when corresponding to the field or private-field-phase reap the field, ordinary harvest does not receive it; session test covers delayed claim.|
| `M096_FallowLand` | Aligned |2 improvements front-end; put food goods token in the cleared grid after Cut Peat / Fell Trees, which is still unused; issue food and remove token when subsequent grids are used; session test covers Fell Trees delayed claim.|
| `M100_Pheromones` | Aligned |No more than 2 improvement cards need to be played, the onBuy owner gets 1 food, and all players with stable or pasture get 2 food; the session test covers cross-player rewards and pre-limits.|
| `M101_ButchersBlock` | Aligned |It is forbidden to play in the 4/7/9/11/13/14 rounds; onBuy uses target-player ActionFlow to first let the owner choose to transfer 0/1 animals, and then let other players with animals in the order of seats to forcefully transfer 1 animal to food; animals are deducted and reused.`exchange`directTrade and normal animal reorg, covering horse.|
| `M102_SavingsDeposit` | Aligned |Each time the harvest starts, the cached starting card sequence number is compared with the clay number. If the hit is successful, 6 food will be given, and then passed`pass-minor-card-to-left`Pass from the strike zone to the left-hand player and send private handChanged.|
| `M104_WildHarvest` | Aligned |onBuy gives 1 food; each harvest start compares the starting card serial number of the cache with the number of visible forests, and a hit gets 1 food; the session test covers hits and misses.|
| `M105_OpenGrill` | Aligned |Tag cookery/baking, metadata exchange supports anytime cooking and bake-bread grain -> 2 food; session test covers exchange registration.|
| `M106_HorseButchery` | Aligned |Mark cookery, metadata exchange supports sheep / boar / cattle / horse / 2 horses cooking; Horse Slaughterhouses are still placed under Fireplaces by FoM major supply; session test covers horse and 2 horses exchange.|
| `M107_PotRoastRecipe` | Aligned |Requires 2+ horses and adds horse -> 2 food via computeExchanges when having fireplace/cooking hearth family; session test covers cookery threshold.|
| `M108_GrainDistillery` | Aligned |Harvest exchange maximum fuel + grain -> 5 food each time; for final use`computeCostedBonus`Press fuel + grain in pairs to exchange for VP, and cannot double occupy the same resource with costed bonuses such as Peat-charcoal Kiln; session testing covers exchange, costed scoring and competitive selection.|
| `M109_Malthouse` | Aligned |After Cut Peat, you can choose to pay exactly 1 grain to get 4 food; if there is no grain, you can choose not to play.|
| `M111_NoTillFarming` | Aligned |2 fields are forwarded; grain/vegetable is planted in unused farmyard spaces through extra sowable field, and the status is still considered unused; FarmBoard renders the on-board extra sow control on the real farmyard tile; placement lock prevents build/plow/fence/terrain coverage when there is a crop, harvest field phase harvests non-field crops, and anytime selection can discard the selected crop.|
| `M112_PeatAshFertilizer` | Aligned |Before Cut Peat, you can choose to add 1 crop of the same type to the existing grain/vegetable in the ordinary field and non-field crop space; the empty field/empty non-field space will not grow, and Cut Peat will still be settled normally.|
| `M113_LivingHistoryMuseum` | Aligned |Clay house front-end; press Museum of the Moors cost listener mode to FoM major upgrade according to the corresponding building resource -1; session test covers front-end and Tiled Oven / Riding Stables discount.|
| `M115_OakBark` | Aligned | `2 Major Improvements`Common prerequisite parser, including`alsoCountsAs: ['major']`dual-type minor; onBuy gives 2 wood, boar / cattle / horse are used after replacing food`resource.exchanged`Equivalent to wood; session test coverage resource event triggering.|
| `M117_DraughtHorses` | Aligned |When there is horse and food, the after.collect wood accumulation grid optionally pays 1 food, and 3/4+ wood gives 1/2 wood; the session test covers the optional payment and threshold.|
| `M131_CattleStall` | Aligned |The onBuy backend selects four different animals and ranks them in the current round +2/+4/+6/+8; consume the token first, and then optionally pay 1 food to buy the corresponding animal and immediately enter the animal reorg; when the token is rejected or the food is insufficient, the token is not retained.|
