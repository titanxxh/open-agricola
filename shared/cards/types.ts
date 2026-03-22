import type { Resource, CostModifier } from '../game/types'

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
  implemented?: boolean
}

const registeredMinorImprovements = new Map<string, CardBase>()

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
  implemented?: boolean

  constructor(data: CardDefinition) {
    Object.assign(this, data)
    if (this instanceof MinorImprovement || this instanceof PlayerActionCard) {
      registeredMinorImprovements.set(this.id, this)
    }
  }
}

export class MinorImprovement extends CardBase {}

export class Occupation extends CardBase {}

export class PlayerActionCard extends CardBase {}

export const getRegisteredMinorImprovement = (id: string) =>
  registeredMinorImprovements.get(id)
