import type { FutureMeepleResourceMap, GameState, PlayerState } from '../contract/types'
import { getParentCardDefinition } from './cards'
import type { MotherCardDefinition, MotherParentCardId, MotherRoundGain } from './types'

const getMotherDefinition = (id: MotherParentCardId | null): MotherCardDefinition | null => {
  if (!id) return null
  const card = getParentCardDefinition(id)
  return card?.kind === 'mother' ? card : null
}

const motherFutureResources = (gain: MotherRoundGain): FutureMeepleResourceMap => {
  switch (gain.type) {
    case 'resource':
      return { [gain.resource]: gain.amount }
    case 'field':
      return { field: gain.amount }
    case 'stable':
      return { stable: gain.amount }
  }
}

const hasQueuedMotherReward = (
  state: GameState,
  player: PlayerState,
  card: MotherCardDefinition,
): boolean =>
  state.futureMeeples.some((entry) =>
    entry.playerId === player.id &&
    entry.cardId === card.id &&
    entry.round === card.round,
  )

export const queueSelectedMotherRewards = (state: GameState): void => {
  if (!state.enableParentCards) return
  for (const player of state.players) {
    const card = getMotherDefinition(player.parentCards.mother)
    if (!card || card.round < state.round || hasQueuedMotherReward(state, player, card)) continue
    state.futureMeeples.push({
      id: `${card.id}-${player.id}-${card.round}-parent`,
      cardId: card.id,
      playerId: player.id,
      round: card.round,
      actionId: state.roundActionOrder[card.round - 1] ?? null,
      resources: motherFutureResources(card.gain),
    })
  }
}
