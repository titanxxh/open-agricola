import { commitFarmOperation } from '../../domain/farm-operations'
import { getCardEffect } from '../card-effects'
/**
 * Card retire / return-to-board helper.
 *
 * Removes a card from a player's `improvements` (Major) or `minorPlayed`
 * (Minor) and optionally returns it to the global available-major pool.
 * Pure mutation; no payment / cost concept.
 *
 * Moved out of payment execution internals (S3 Task 8 A3 decision) because it
 * belongs to the cards / retire domain rather than the payment domain.
 */

import type { GameState, PlayerState } from '../../contract/types'
import { returnMajorImprovementToSupply } from '../major/supply'

export const canReturnImprovement = (player: PlayerState, cardId: string): boolean =>
  ![...player.occupationPlayed, ...player.minorPlayed, ...player.improvements].some(
    source => getCardEffect(source)?.protectedImprovementIds?.(player).includes(cardId),
  )

export const returnCardToBoard = (
  player: PlayerState,
  cardId: string,
  state?: Pick<GameState, 'availableMajorImprovements' | 'majorImprovementSupply'>,
): void => {
  if (!canReturnImprovement(player, cardId)) throw new Error('Improvement is committed and cannot be returned')
  if (player.farmyardSpaceStates?.some(token => token.sourceCardId === cardId)) {
    commitFarmOperation(player, {
      kind: 'space-states',
      states: player.farmyardSpaceStates.filter(token => token.sourceCardId !== cardId),
      positions: [],
      sourceCardId: cardId,
    })
  }
  const improvementIndex = player.improvements.indexOf(cardId)
  if (improvementIndex > -1) {
    player.improvements.splice(improvementIndex, 1)
    if (state) returnMajorImprovementToSupply(state, cardId)
  }
  const minorPlayedIndex = player.minorPlayed.indexOf(cardId)
  if (minorPlayedIndex > -1) {
    player.minorPlayed.splice(minorPlayedIndex, 1)
    if (player.extraOccupationsFromCards) {
      player.extraOccupationsFromCards = player.extraOccupationsFromCards.filter(
        (id) => id !== cardId,
      )
    }
    if (player.cardStates) {
      // Already awarded points belong to the player, even after the source retires.
      const earned = player.cardStates[cardId]?.counters?.bonusVp ?? 0
      if (earned > 0) player.cardStates[cardId] = { counters: { bonusVp: earned } }
      else delete player.cardStates[cardId]
    }
  }
}
