import type { Resource } from './types'

export type MinorImprovement = {
  id: string
  cost: Partial<Resource>
  reward?: Partial<Resource>
}

export const minorImprovements: MinorImprovement[] = [
  { id: 'small-tools', cost: { wood: 1 }, reward: { clay: 1 } },
  { id: 'spare-bucket', cost: { reed: 1 }, reward: { food: 1 } },
  { id: 'grain-scoop', cost: { wood: 1 }, reward: { grain: 1 } },
  { id: 'clay-bucket', cost: { wood: 1 }, reward: { clay: 2 } },
  { id: 'stone-bowl', cost: { clay: 1 }, reward: { stone: 1 } },
  { id: 'extra-sack', cost: { reed: 1 }, reward: { grain: 1 } },
  { id: 'warm-stew', cost: { grain: 1 }, reward: { food: 2 } },
  { id: 'wood-sledge', cost: { food: 1 }, reward: { wood: 2 } },
  { id: 'B75_WoodWorkshop', cost: { wood: 1 } },
  { id: 'A83_ShepherdsCrook', cost: { wood: 1 } },
  { id: 'E74_AshTrees', cost: { wood: 1 } },
  { id: 'A65_SeedPellets', cost: { food: 1 } },
  { id: 'A105_BarrowPusher', cost: { wood: 1 } },
  { id: 'E53_BoarSpear', cost: { wood: 1 } },
]

export const minorImprovementIds = minorImprovements.map(
  (improvement) => improvement.id,
)

export const getMinorImprovement = (id: string) =>
  minorImprovements.find((improvement) => improvement.id === id)
