// Pure card-related types. Sourced from S6a split of shared/cards/types.ts.

import type { Resource, PaymentResourceMap, CostModifier, TradeSideEffect, ComplexCost } from './types'

export type CardType = 'major' | 'minor' | 'occupation'

export type ExchangeWindow = 'anytime' | 'harvest' | 'bake-bread'

export type CardExchange = {
  from: Partial<Resource>
  to: Partial<Resource>
  max?: number
  sourceId?: string
  /**
   * Multi-window form. Empty array (or omitted) means the exchange is only
   * invocable via listener-triggered `tradeIds` (e.g. E53 BoarSpear, which
   * lives outside any visible cookery window).
   */
  triggers?: ExchangeWindow[]
  /**
   * Optional side-effect dispatched via `applyTradeSideEffect` after the
   * exchange resources are applied. E153 StoneSculptor uses
   * `{ type: 'bonusVp', amount: 1 }` to write
   * `cardStates[sourceId].extraData.bonusVpEarned += amount * times` for
   * later read by `computeBonusScore`.
   */
  sideEffect?: TradeSideEffect
}

export type CardPrerequisites = {
  min?: number
  max?: number
}

export type CardDefinition = {
  id: string
  name: string
  deck: string
  number: number
  category?: string
  desc: string[]
  cost?: PaymentResourceMap | ComplexCost
  altCosts?: PaymentResourceMap[]
  vp?: number
  prerequisite?: string
  maxRound?: number
  isCookery?: boolean
  isBaking?: boolean
  returnCards?: string[]
  occupationPrerequisites?: CardPrerequisites
  improvementPrerequisites?: CardPrerequisites
  players?: string
  passing?: boolean
  modifier?: CostModifier
  modifiers?: CostModifier[]
  exchanges?: CardExchange[]
  implemented?: boolean
  evenMoreSet?: boolean
  extraVp?: boolean
  providesField?: boolean
  providesOccupation?: boolean
  /**
   * BGA `$this->field = true`: marks the card itself as a field. C80 Rocky
   * Terrain triggers off `Improvement` / `Occupation` events whose played
   * card has `isField === true` (treated as plowing a field). Cards that
   * also act as a literal sowable field (B68/C70/E68/E69/E70/E72) carry
   * `isField: true` plus `onComputeSowableFields` / `onSowExtraField` /
   * `onHarvestFieldPhase` effects; field-only occupations (B113/B141)
   * carry `isField: true` purely as metadata.
   */
  isField?: boolean
  fireplaceIdentity?: boolean
  cookingHearthIdentity?: boolean
  ovenIdentity?: boolean
  potteryIdentity?: boolean
  preventsHandDiscard?: boolean
  animalHolder?: boolean
  blocksHouseAnimalZones?: boolean
  waresSalesmanGains?: readonly Partial<Resource>[]
  mustBePlayedViaMinorAction?: boolean
  /**
   * BGA `isBuyable` actionType gate ('Major' / 'MajorOrMinor'): A10 Wooden
   * Shed enforces "this card can only be played via a Major Improvement
   * action". When set, the minor cannot be bought through the
   * `minor-improvement` action space (only via `improvement-any` / direct
   * card-effect plays).
   */
  mustBePlayedViaMajorImprovementAction?: boolean
  enablesPalisades?: boolean
  alsoCountsAs?: CardType[]
  /**
   * BGA `$this->field = true` + `getFieldDetails()`. Declarative card-field config.
   * When set, `shared/cards/helpers/card-field.ts` derives sow / harvest / isDoable
   * behavior automatically (see docs/ARCHITECTURE.md → cardField).
   * `allowedCrops` mirrors BGA constraints (`null` = all 4 crops);
   * `capacity` is the number of independent stacks the card can hold.
   * Side-effects (e.g. E68 last-wood bonus) are wired via `makeCardFieldImpl`'s
   * `onReap` callback, not via this metadata.
   */
  cardField?: {
    allowedCrops: readonly ('grain' | 'vegetable' | 'wood' | 'stone')[]
    capacity: number
  }
  locales?: Record<string, { name: string; desc: string[]; prerequisite?: string }>
}
