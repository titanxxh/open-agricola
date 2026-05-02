import type { Resource, CostModifier, TradeSideEffect, ComplexCost } from '../game/types'

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
  newSet?: boolean
  modifier?: CostModifier
  modifiers?: CostModifier[]
  exchanges?: CardExchange[]
  implemented?: boolean
  evenMoreSet?: boolean
  extraVp?: boolean
  providesField?: boolean
  providesOccupation?: boolean
  fireplaceIdentity?: boolean
  mustBePlayedViaMinorAction?: boolean
  alsoCountsAs?: CardType[]
  /** Majors-only: scoring tier table read by major-improvements scoring. */
  scoring?: {
    resource: keyof Resource
    map: Record<string, number>
  }
  locales?: Record<string, { name: string; desc: string[]; prerequisite?: string }>
}

// Late-bound lookup hooks — catalog.ts installs these after its arrays are
// built. Constructors stay side-effect-free (no module-level mutation).
let minorLookup: ((id: string) => CardBase | undefined) | undefined
let occupationLookup: ((id: string) => CardBase | undefined) | undefined

export const registerCardLookups = (lookups: {
  minor: (id: string) => CardBase | undefined
  occupation: (id: string) => CardBase | undefined
}) => {
  minorLookup = lookups.minor
  occupationLookup = lookups.occupation
}

// Ad-hoc test-only registration: tests that construct `new MinorImprovement(...)`
// or `new Occupation(...)` with fabricated fixture ids (e.g. `TEST_FieldProvider`,
// `__TEST_OCC_VP__`) can push them here so lookups resolve without depending on
// the catalog arrays. Not used by production code paths.
const adHocMinors = new Map<string, CardBase>()
const adHocOccupations = new Map<string, CardBase>()

export const registerAdHocMinorImprovement = (card: CardBase): void => {
  adHocMinors.set(card.id, card)
}

export const registerAdHocOccupation = (card: CardBase): void => {
  adHocOccupations.set(card.id, card)
}

export class CardBase {
  id!: string
  name!: string
  deck!: string
  number!: number
  category?: string
  desc!: string[]
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
  newSet?: boolean
  modifier?: CostModifier
  modifiers?: CostModifier[]
  exchanges?: CardExchange[]
  implemented?: boolean
  evenMoreSet?: boolean
  extraVp?: boolean
  providesField?: boolean
  providesOccupation?: boolean
  fireplaceIdentity?: boolean
  mustBePlayedViaMinorAction?: boolean
  alsoCountsAs?: CardType[]
  scoring?: {
    resource: keyof Resource
    map: Record<string, number>
  }
  locales?: Record<string, { name: string; desc: string[]; prerequisite?: string }>

  constructor(data: CardDefinition) {
    Object.assign(this, data)
  }

  /** Serialize back to a plain CardDefinition for transmission to the frontend. */
  toJSON(): CardDefinition {
    const def: CardDefinition = {
      id: this.id,
      name: this.name,
      deck: this.deck,
      number: this.number,
      desc: this.desc,
    }
    if (this.category) def.category = this.category
    if (this.cost) def.cost = this.cost
    if (this.altCosts) def.altCosts = this.altCosts
    if (this.vp !== undefined) def.vp = this.vp
    if (this.prerequisite) def.prerequisite = this.prerequisite
    if (this.maxRound !== undefined) def.maxRound = this.maxRound
    if (this.isCookery) def.isCookery = this.isCookery
    if (this.isBaking) def.isBaking = this.isBaking
    if (this.returnCards) def.returnCards = this.returnCards
    if (this.occupationPrerequisites) def.occupationPrerequisites = this.occupationPrerequisites
    if (this.improvementPrerequisites) def.improvementPrerequisites = this.improvementPrerequisites
    if (this.players) def.players = this.players
    if (this.passing) def.passing = this.passing
    if (this.newSet) def.newSet = this.newSet
    if (this.modifier) def.modifier = this.modifier
    if (this.modifiers) def.modifiers = this.modifiers
    if (this.exchanges) def.exchanges = this.exchanges
    if (this.implemented !== undefined) def.implemented = this.implemented
    if (this.evenMoreSet) def.evenMoreSet = this.evenMoreSet
    if (this.extraVp) def.extraVp = this.extraVp
    if (this.providesField) def.providesField = this.providesField
    if (this.providesOccupation) def.providesOccupation = this.providesOccupation
    if (this.fireplaceIdentity) def.fireplaceIdentity = this.fireplaceIdentity
    if (this.mustBePlayedViaMinorAction) def.mustBePlayedViaMinorAction = this.mustBePlayedViaMinorAction
    if (this.alsoCountsAs) def.alsoCountsAs = this.alsoCountsAs
    if (this.locales) def.locales = this.locales
    return def
  }
}

export class MinorImprovement extends CardBase {}

export class Occupation extends CardBase {}

export class PlayerActionCard extends CardBase {}

export const getRegisteredMinorImprovement = (id: string): CardBase | undefined =>
  minorLookup?.(id) ?? adHocMinors.get(id)

export const getRegisteredOccupation = (id: string): CardBase | undefined =>
  occupationLookup?.(id) ?? adHocOccupations.get(id)
