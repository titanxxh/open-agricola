import type { Resource, CostModifier } from '../game/types'

export type CardExchange = {
  from: Partial<Resource>
  to: Partial<Resource>
  max?: number
  trigger?: 'bake-bread' | 'anytime' | 'harvest'
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
  cost?: Partial<Resource>
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
  isMajorImprovement?: boolean
  locales?: Record<string, { name: string; desc: string[]; prerequisite?: string }>
}

const registeredMinorImprovements = new Map<string, CardBase>()
const registeredOccupations = new Map<string, CardBase>()

export class CardBase {
  id!: string
  name!: string
  deck!: string
  number!: number
  category?: string
  desc!: string[]
  cost?: Partial<Resource>
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
  isMajorImprovement?: boolean
  locales?: Record<string, { name: string; desc: string[]; prerequisite?: string }>

  constructor(data: CardDefinition) {
    Object.assign(this, data)
    if (this instanceof MinorImprovement || this instanceof PlayerActionCard) {
      registeredMinorImprovements.set(this.id, this)
    }
    if (this instanceof Occupation) {
      registeredOccupations.set(this.id, this)
    }
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
    if (this.isMajorImprovement) def.isMajorImprovement = this.isMajorImprovement
    if (this.locales) def.locales = this.locales
    return def
  }
}

export class MinorImprovement extends CardBase {}

export class Occupation extends CardBase {}

export class PlayerActionCard extends CardBase {}

export const getRegisteredMinorImprovement = (id: string) =>
  registeredMinorImprovements.get(id)

export const getRegisteredOccupation = (id: string) =>
  registeredOccupations.get(id)
