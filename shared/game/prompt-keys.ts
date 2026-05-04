import type { ReorganizeTrigger } from '../actions/effects/reorganize'
import type { CropStack } from './types'

type CropType = CropStack['kind']

export type PromptKey =
  | 'ui.interactionAnimalReorg'
  | 'ui.confirmNextPlayer'
  | 'ui.confirmPlayerSwitch'
  | 'ui.harvestFeed'
  | 'ui.interactionPlow'
  | 'ui.interactionSow'
  | 'ui.interactionFence'
  | 'ui.interactionRoom'
  | 'ui.interactionStable'
  | 'ui.interactionSelection'
  | 'ui.interactionOccupationHand'
  | 'ui.interactionCardDraft'
  | 'ui.interactionExchange'
  | 'ui.interactionBakeBread'
  | 'ui.interactionFlowSelect'
  | 'ui.interactionOptionalAction'
  | `ui.cards.${string}`

export type PromptParams<K extends PromptKey> =
  K extends 'ui.harvestFeed'              ? { remaining: number; foodUsed: number }
  : K extends 'ui.interactionAnimalReorg' ? { trigger: ReorganizeTrigger }
  : K extends 'ui.interactionSow'         ? { allowedCrops?: CropType[]; needed?: number }
  : K extends 'ui.interactionRoom'        ? { needed?: number; maxSelections?: number }
  : K extends 'ui.interactionStable'      ? { needed?: number; maxSelections?: number }
  : K extends 'ui.interactionFence'       ? { extraWood?: number }
  : K extends 'ui.interactionSelection'   ? { maxSelections: number; minSelections?: number }
  : K extends 'ui.interactionOccupationHand' ? { maxSelections: number; minSelections: number }
  : K extends `ui.cards.${string}`        ? Record<string, unknown>
  : Record<string, never>
