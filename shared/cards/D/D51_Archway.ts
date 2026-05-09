import { registerPlayerActionSpace, createPlayerActionSpaces } from '../player-action-space'
import { isSpaceOccupied, spaceHasPlayer } from '../../domain/space'
import type { CardImpl } from '../registry'
import { D51_Archway } from '../../cards-display/D/D51_Archway'

const CARD_ID = D51_Archway.id

registerPlayerActionSpace({
  cardId: CARD_ID,
  access: 'all',
  createDefinition: (_ownerId) => ({
    id: CARD_ID,
    nameKey: 'cards.D51_Archway.name',
    descriptionKey: 'cards.D51_Archway.desc',
    canBeExecutedByPlayer: () => true,
    execute: ({ player }) => {
      player.resources.food += 1
      return {
        type: 'ok',
        resourcesGained: { food: 1 },
      }
    },
  }),
})

export const D51_Archway_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, _player) => {
    const newSpaces = createPlayerActionSpaces(state)
    for (const space of newSpaces) {
      if (!state.actionSpaces.some((s) => s.id === space.id)) {
        state.actionSpaces.push(space)
      }
    }
  },
  onBeforeReturnHome: (state, player) => {
    // Only the player whose worker is on D51 gets the move effect
    const d51Space = state.actionSpaces.find((s) => s.id === CARD_ID)
    if (!d51Space || !spaceHasPlayer(d51Space, player.id)) return
    // Check if there are unoccupied action spaces the player can use
    const hasAvailable = state.actionSpaces.some(
      (s) => !isSpaceOccupied(s) && s.id !== CARD_ID && s.canBeExecutedByPlayer(state, player),
    )
    if (!hasAvailable) return
    return {
      type: 'leaf',
      actionId: 'move-farmer-to-space',
      params: { excludeSpaceId: CARD_ID },
      sourceCard: CARD_ID,
      optional: true,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
