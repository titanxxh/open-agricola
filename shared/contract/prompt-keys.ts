import type { ReorganizeTrigger } from '../actions/effects/reorganize'
import type { CropStack } from '../contract/types'

type CropType = CropStack['kind']

export type PromptKey =
  // Core interaction prompts
  | 'ui.interactionAnimalReorg'
  | 'ui.confirmNextPlayer'
  | 'ui.confirmPlayerSwitch'
  | 'ui.harvestFeed'
  | 'ui.interactionFlowSelect'
  | 'ui.interactionOptionalAction'
  // Farm action prompts (with both bare and -Select suffix variants)
  | 'ui.interactionPlow' | 'ui.interactionPlowSelect'
  | 'ui.interactionSow' | 'ui.interactionSowSelect'
  | 'ui.interactionFence' | 'ui.interactionFenceSelect'
  | 'ui.interactionRoom' | 'ui.interactionRoomSelect'
  | 'ui.interactionStable' | 'ui.interactionStableSelect'
  // Selection / draft / common multi-step
  | 'ui.interactionSelection'
  | 'ui.interactionOccupationHand'
  | 'ui.interactionCardDraft'
  | 'ui.interactionExchange' | 'ui.interactionExchangeChoice'
  | 'ui.interactionBakeBread' | 'ui.interactionBakeBreadCount' | 'ui.interactionBakeBreadChoice'
  // Other ad-hoc engine / improvement / occupation prompts
  | 'ui.interactionChooseImprovement'
  | 'ui.interactionChooseMinorImprovement'
  | 'ui.interactionChooseOccupation'
  | 'ui.interactionGrainUtilizationChoice'
  | 'ui.interactionPlaceFarmerExtra'
  | 'ui.interactionRecallPlacedWorker'
  | 'ui.interactionMoveFarmerToSpace'
  | 'ui.interactionFarmExpansionSelect'
  | 'ui.interactionCultivationSelect'
  | 'ui.interactionDiscardFromHand'
  | 'ui.optionalBuildRoom'
  | 'ui.selectImprovement'
  | 'ui.stubPayGainVpPrompt'
  // Card-specific ad-hoc prompts (Group C — kept enumerated for typecheck strictness)
  | 'ui.interactionAleBenches'
  | 'ui.interactionAshTrees'
  | 'ui.interactionBellfounder'
  | 'ui.interactionBucksawPrompt'
  | 'ui.interactionCob'
  | 'ui.interactionCollectorSelect'
  | 'ui.interactionDairyCrierChoice'
  | 'ui.interactionEarthenwarePotter'
  | 'ui.interactionFieldMerchantChoose'
  | 'ui.interactionFirewoodExchange'
  | 'ui.interactionFodderPlanterSow'
  | 'ui.interactionForestInn'
  | 'ui.interactionFreshmanOccupation'
  | 'ui.interactionGodlySpouse'
  | 'ui.interactionHammerCrusherBuild'
  | 'ui.interactionHaydryer'
  | 'ui.interactionLazySowmanPlace'
  | 'ui.interactionMerchantPrompt'
  | 'ui.interactionNewPurchaseGrain'
  | 'ui.interactionNewPurchaseVegetable'
  | 'ui.interactionOverachieverImprovement'
  | 'ui.interactionPioneeringSpirit'
  | 'ui.interactionReclamationPlow'
  | 'ui.interactionReclamationPlowAmbiguous'
  | 'ui.interactionRiparianBuilderConstruct'
  | 'ui.interactionSaddlerPlow'
  | 'ui.interactionSilage'
  | 'ui.interactionSlurrySow'
  | 'ui.interactionSmallPottersOvenBuild'
  | 'ui.interactionStockProtectorPlace'
  | 'ui.interactionToolboxImprovement'
  | 'ui.interactionWoodBartererPrompt'
  | 'ui.interactionWorkshopAssistantSelect'
  // Card-specific not yet caught above
  | 'ui.interactionChooseRenovationTarget'
  // Action / payment infrastructure prompt keys (non `ui.*` namespace)
  | 'actions.resource-market.description'
  | 'prompt.selectPayment'
  // Forward-compat template literal escape hatch for new card hooks
  | `ui.cards.${string}`

export type PromptParams<K extends PromptKey> =
  K extends 'ui.harvestFeed'              ? { remaining: number; foodUsed: number }
  : K extends 'ui.interactionAnimalReorg' ? { trigger: ReorganizeTrigger }
  : K extends 'ui.interactionSow' | 'ui.interactionSowSelect'         ? { allowedCrops?: CropType[]; needed?: number }
  : K extends 'ui.interactionRoom' | 'ui.interactionRoomSelect'       ? { needed?: number; maxSelections?: number }
  : K extends 'ui.interactionStable' | 'ui.interactionStableSelect'   ? { needed?: number; maxSelections?: number }
  : K extends 'ui.interactionFence' | 'ui.interactionFenceSelect'     ? { extraWood?: number }
  : K extends 'ui.interactionSelection'   ? { maxSelections: number; minSelections?: number }
  : K extends 'ui.interactionOccupationHand' ? { maxSelections: number; minSelections: number }
  : K extends `ui.cards.${string}`        ? Record<string, unknown>
  : Record<string, never>
