import type { AnimalKey } from '../contract/animals'
import type { ResourceKey } from '../contract/types'

export type ParentCardKind = 'mother' | 'father'

export type MotherParentCardId =
  | 'PR01' | 'PR02' | 'PR03' | 'PR04' | 'PR05' | 'PR06'
  | 'PR07' | 'PR08' | 'PR09' | 'PR10' | 'PR11' | 'PR12'

export type FatherParentCardId =
  | 'PS01' | 'PS02' | 'PS03' | 'PS04' | 'PS05' | 'PS06'
  | 'PS07' | 'PS08' | 'PS09' | 'PS10' | 'PS11' | 'PS12'

export type ParentCardId = MotherParentCardId | FatherParentCardId

export type ParentCardAsset<TKind extends ParentCardKind = ParentCardKind> = {
  front: `${ParentCardId}.png`
  back: TKind
}

export type MotherRoundGain =
  | { type: 'resource'; resource: Exclude<ResourceKey, 'begging'>; amount: number }
  | { type: 'field'; amount: 1 }
  | { type: 'stable'; amount: 1; fromSupply: true; freeBuild: boolean }

export type MotherCardDefinition = {
  id: MotherParentCardId
  kind: 'mother'
  score: number
  round: number
  gain: MotherRoundGain
  text: string
  assets: ParentCardAsset<'mother'>
}

export type FatherRequirement =
  | { type: 'resource-at-least'; resource: ResourceKey; amount: number }
  | { type: 'animal-at-least'; animal: AnimalKey | 'any'; amount: number }
  | { type: 'farm-count-at-least'; target: 'room' | 'field' | 'pasture' | 'stable' | 'fenced-stable' | 'family-member' | 'fence' | 'empty-space'; amount: number }
  | { type: 'played-card-at-least'; cardType: 'occupation' | 'minor-improvement' | 'major-improvement' | 'improvement'; amount: number }
  | { type: 'all'; requirements: FatherRequirement[] }
  | { type: 'any'; requirements: FatherRequirement[] }
  | { type: 'manual'; key: string; reviewed: true }

export type FatherRewardEffect =
  | { type: 'gain-resources'; resources: Partial<Record<Exclude<ResourceKey, 'begging'>, number>> }
  | { type: 'build-token'; token: 'stable' | 'fence'; amount: number; freeBuild: boolean }
  | { type: 'plow-field'; amount: number }
  | { type: 'bonus-points'; amount: number }
  | { type: 'manual'; key: string; reviewed: true }

export type FatherReward = {
  tier: 1 | 2 | 3
  requirementText: string
  requirement: FatherRequirement
  rewardText: string
  effects: FatherRewardEffect[]
}

export type FatherCardDefinition = {
  id: FatherParentCardId
  kind: 'father'
  conditionText: string
  rewards: [FatherReward, FatherReward, FatherReward]
  text: string
  assets: ParentCardAsset<'father'>
}

export type ParentCardDefinition = MotherCardDefinition | FatherCardDefinition
