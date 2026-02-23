import type { Resource } from '../../game/types'

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
  prerequisite?: string
  occupationPrerequisites?: CardPrerequisites
  improvementPrerequisites?: CardPrerequisites
  players?: string
  passing?: boolean
  newSet?: boolean
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
  prerequisite?: string
  occupationPrerequisites?: CardPrerequisites
  improvementPrerequisites?: CardPrerequisites
  players?: string
  passing?: boolean
  newSet?: boolean

  constructor(data: CardDefinition) {
    Object.assign(this, data)
  }
}

export class MinorImprovement extends CardBase {}

export class Occupation extends CardBase {}

export class PlayerActionCard extends CardBase {}
