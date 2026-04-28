import type { PlayerState, Resource } from '../../game/types'
import { gainResources } from '../../actions/effects/gain'
import { incCounter } from '../__stubs__/helpers'
import { addCardResourceGained } from './card-state'
import {
  addResourcesFromBoard,
  addResourcesFromCards,
} from '../../logic/stats'

export type CardGain = Partial<Resource> & { score?: number }

export const splitCardGain = (gain: CardGain | undefined) => {
  const resources: Partial<Resource> = {}
  let score = 0

  Object.entries(gain ?? {}).forEach(([key, value]) => {
    if (typeof value !== 'number' || value <= 0) return
    if (key === 'score') {
      score += value
      return
    }
    resources[key as keyof Resource] = value
  })

  return { resources, score }
}

export const applyCardGain = (
  player: PlayerState,
  gain: CardGain,
  cardId?: string,
) => {
  const { resources, score } = splitCardGain(gain)
  if (Object.keys(resources).length > 0) {
    gainResources(player, resources)
    if (cardId) {
      addCardResourceGained(player, cardId, resources)
      addResourcesFromCards(player, resources)
    } else {
      addResourcesFromBoard(player, resources)
    }
  }
  if (score > 0 && cardId) {
    incCounter(player, cardId, 'bonusVp', score)
  }
  return { resources, score }
}
