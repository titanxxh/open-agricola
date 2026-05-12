// Pure card-related types. Sourced from S6a split of shared/cards/types.ts.

import type { Resource, CostModifier, TradeSideEffect, ComplexCost } from './types'

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
  cost?: Partial<Resource> | ComplexCost
  altCosts?: Partial<Resource>[]
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
  /** Majors-only: scoring tier table read by major-improvements scoring. */
  scoring?: {
    resource: keyof Resource
    map: Record<string, number>
  }
  locales?: Record<string, { name: string; desc: string[]; prerequisite?: string }>
}
