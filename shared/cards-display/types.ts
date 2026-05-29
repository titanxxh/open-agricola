// Card display class hierarchy. Sourced from S6a split of shared/cards/types.ts.
// Owns: CardBase + 3 subclass markers + ad-hoc lookup state.
// Production lookup is wired by `shared/cards/registry-runtime.ts` via
// __setMinorLookup / __setOccupationLookup.

import type { Resource, PaymentResourceMap, CostModifier, ComplexCost } from '../contract/types'
import type {
  CardType,
  CardExchange,
  CardPrerequisites,
  CardDefinition,
} from '../contract/cards'

// Late-bound lookup hooks installed by registry-runtime.ts. Constructors stay
// side-effect-free (no module-level mutation).
let minorLookup: ((id: string) => CardBase | undefined) | undefined
let occupationLookup: ((id: string) => CardBase | undefined) | undefined

export const __setMinorLookup = (
  fn: ((id: string) => CardBase | undefined) | undefined,
): void => {
  minorLookup = fn
}

export const __setOccupationLookup = (
  fn: ((id: string) => CardBase | undefined) | undefined,
): void => {
  occupationLookup = fn
}

// Ad-hoc test-only registration: tests that construct `new MinorImprovement(...)`
// or `new Occupation(...)` with fabricated fixture ids (e.g. `TEST_FieldProvider`,
// `__TEST_OCC_VP__`) can push them here so lookups resolve without depending on
// the catalog arrays. Not used by production code paths.
const adHocMinors = new Map<string, CardBase>()
const adHocOccupations = new Map<string, CardBase>()

export const __getAdHocMinors = (): Map<string, CardBase> => adHocMinors
export const __getAdHocOccupations = (): Map<string, CardBase> => adHocOccupations

export class CardBase {
  id!: string
  name!: string
  deck!: string
  number!: number
  category?: string
  desc!: string[]
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
  isField?: boolean
  cardField?: { allowedCrops: readonly ('grain' | 'vegetable' | 'wood' | 'stone')[]; capacity: number }
  fireplaceIdentity?: boolean
  cookingHearthIdentity?: boolean
  ovenIdentity?: boolean
  potteryIdentity?: boolean
  preventsHandDiscard?: boolean
  animalHolder?: boolean
  blocksHouseAnimalZones?: boolean
  waresSalesmanGains?: readonly Partial<Resource>[]
  mustBePlayedViaMinorAction?: boolean
  mustBePlayedViaMajorImprovementAction?: boolean
  enablesPalisades?: boolean
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
    if (this.modifier) def.modifier = this.modifier
    if (this.modifiers) def.modifiers = this.modifiers
    if (this.exchanges) def.exchanges = this.exchanges
    if (this.implemented !== undefined) def.implemented = this.implemented
    if (this.evenMoreSet) def.evenMoreSet = this.evenMoreSet
    if (this.extraVp) def.extraVp = this.extraVp
    if (this.providesField) def.providesField = this.providesField
    if (this.providesOccupation) def.providesOccupation = this.providesOccupation
    if (this.isField) def.isField = this.isField
    if (this.cardField) def.cardField = this.cardField
    if (this.fireplaceIdentity) def.fireplaceIdentity = this.fireplaceIdentity
    if (this.cookingHearthIdentity) def.cookingHearthIdentity = this.cookingHearthIdentity
    if (this.ovenIdentity) def.ovenIdentity = this.ovenIdentity
    if (this.potteryIdentity) def.potteryIdentity = this.potteryIdentity
    if (this.preventsHandDiscard) def.preventsHandDiscard = this.preventsHandDiscard
    if (this.animalHolder) def.animalHolder = this.animalHolder
    if (this.blocksHouseAnimalZones) def.blocksHouseAnimalZones = this.blocksHouseAnimalZones
    if (this.waresSalesmanGains) def.waresSalesmanGains = this.waresSalesmanGains
    if (this.mustBePlayedViaMinorAction) def.mustBePlayedViaMinorAction = this.mustBePlayedViaMinorAction
    if (this.mustBePlayedViaMajorImprovementAction) def.mustBePlayedViaMajorImprovementAction = this.mustBePlayedViaMajorImprovementAction
    if (this.enablesPalisades) def.enablesPalisades = this.enablesPalisades
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
