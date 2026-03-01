import type { Resource, CostModifier } from '../../game/types'

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
  reward?: Partial<Resource>
  vp?: number
  prerequisite?: string
  isCookery?: boolean
  isBaking?: boolean
  occupationPrerequisites?: CardPrerequisites
  improvementPrerequisites?: CardPrerequisites
  players?: string
  passing?: boolean
  newSet?: boolean
  modifier?: CostModifier
}

export class CardBase {
  id!: string
  name!: string
  deck!: string
  number!: number
  category?: string
  desc!: string[]
  cost?: Partial<Resource>
  reward?: Partial<Resource>
  vp?: number
  prerequisite?: string
  isCookery?: boolean
  isBaking?: boolean
  occupationPrerequisites?: CardPrerequisites
  improvementPrerequisites?: CardPrerequisites
  players?: string
  passing?: boolean
  newSet?: boolean
  modifier?: CostModifier

  constructor(data: CardDefinition) {
    Object.assign(this, data)
  }
}

export class MinorImprovement extends CardBase {}

export class Occupation extends CardBase {}

export class PlayerActionCard extends CardBase {}
