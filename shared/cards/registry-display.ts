import type { CardDefinition } from '../contract/cards'
import {
  getAdHocMinorImprovement,
  getAdHocOccupation,
} from './registry-runtime'
import {
  getMinorImprovementCard,
  getOccupationCard,
} from './catalog'
import { majorImprovementIdsList as majorIds } from './major/generated'

export type CardBase = CardDefinition

class CardDefinitionWrapper {
  constructor(input: CardDefinition) {
    Object.assign(this, input)
  }

  toJSON(): CardDefinition {
    const { toJSON: _toJSON, ...json } = this as unknown as CardDefinitionWrapper & CardDefinition
    return json
  }
}

export class MinorImprovement extends CardDefinitionWrapper implements CardDefinition {
  declare id: string
  declare name: string
  declare deck: string
  declare number: number
  declare desc: string[]

  constructor(input: CardDefinition) {
    super(input)
  }
}

export class Occupation extends CardDefinitionWrapper implements CardDefinition {
  declare id: string
  declare name: string
  declare deck: string
  declare number: number
  declare desc: string[]

  constructor(input: CardDefinition) {
    super(input)
  }
}

export class PlayerActionCard extends MinorImprovement {}

export function getMinorImprovement(id: string): CardDefinition | undefined {
  return getMinorImprovementCard(id) ?? getAdHocMinorImprovement(id)
}

export function getOccupation(id: string): CardDefinition | undefined {
  return getOccupationCard(id) ?? getAdHocOccupation(id)
}

export const getRegisteredMinorImprovement = (id: string): CardDefinition | undefined =>
  getMinorImprovement(id)

export const getRegisteredOccupation = (id: string): CardDefinition | undefined =>
  getOccupation(id)

export const majorImprovementIds = majorIds
