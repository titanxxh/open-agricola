/**
 * Card retire / return-to-board helper.
 *
 * Removes a card from a player's `improvements` (Major) or `minorPlayed`
 * (Minor) and optionally returns it to the global available-major pool.
 * Pure mutation; no payment / cost concept.
 *
 * Moved out of `shared/actions/payment/internal/execute.ts` (S3 Task 8 A3
 * decision) — semantically belongs to the cards / retire domain rather than
 * the payment domain. May relocate again to `shared/domain/` aggregates in S4.
 */

import type { GameState, PlayerState } from '../../game/types'

export const returnCardToBoard = (
  player: PlayerState,
  cardId: string,
  state?: Pick<GameState, 'availableMajorImprovements'>,
): void => {
  const improvementIndex = player.improvements.indexOf(cardId)
  if (improvementIndex > -1) {
    player.improvements.splice(improvementIndex, 1)
    if (state && !state.availableMajorImprovements.includes(cardId)) {
      state.availableMajorImprovements.push(cardId)
    }
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
      delete player.cardStates[cardId]
    }
  }
}
