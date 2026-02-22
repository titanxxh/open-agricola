import type { ActionExecutionResult, PlayerState } from '../../game/types'
import { getOccupation } from '../../game/occupations'
import { gainResources } from './gain'
import { canPayResources, payResources } from './pay'

export const playOccupation = (
  player: PlayerState,
  occupationId: string,
  costOverride?: Partial<PlayerState['resources']>,
): ActionExecutionResult => {
  const occupation = getOccupation(occupationId)
  if (!occupation) {
    return { type: 'fail', logKey: 'log.occupationFail' }
  }
  if (!player.occupationHand.includes(occupation.id)) {
    return { type: 'fail', logKey: 'log.occupationFail' }
  }
  const cost =
    costOverride ?? getOccupationCost(player, occupationId) ?? occupation.cost
  if (!canPayResources(player, cost)) {
    return { type: 'fail', logKey: 'log.occupationFail' }
  }
  payResources(player, cost)
  if (occupation.reward) {
    gainResources(player, occupation.reward)
  }
  player.occupationHand = player.occupationHand.filter(
    (id) => id !== occupation.id,
  )
  player.occupationPlayed.push(occupation.id)
  player.playedCards = player.playedCards ?? []
  player.playedCards.push(`occupation:${occupation.id}`)
  return { type: 'ok' }
}

export const getOccupationCost = (
  player: PlayerState,
  occupationId: string,
) => {
  const occupation = getOccupation(occupationId)
  if (!occupation) return null
  const cost = { ...occupation.cost }
  if (player.occupationPlayed.includes('B109_PaperMaker') && (cost.food ?? 0) > 0) {
    cost.food = Math.max(0, (cost.food ?? 0) - 1)
  }
  return cost
}
