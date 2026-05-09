import { registerPlayerActionSpace, createPlayerActionSpaces } from '../player-action-space'
import type { CardImpl } from '../registry'

const CARD_ID = 'C162_ForestOwner'

registerPlayerActionSpace({
  cardId: CARD_ID,
  access: 'all',
  createDefinition: (ownerId) => ({
    id: CARD_ID,
    nameKey: 'cards.C162_ForestOwner.name',
    descriptionKey: 'cards.C162_ForestOwner.desc',
    canBeExecutedByPlayer: () => true,
    execute: ({ state, player }) => {
      if (player.id === ownerId) {
        player.resources.wood += 4
        return { type: 'ok', resourcesGained: { wood: 4 } }
      }
      // Other player: gets 3 wood, owner gets 1 wood from supply
      player.resources.wood += 3
      const owner = state.players.find((p) => p.id === ownerId)
      if (owner) owner.resources.wood += 1
      return { type: 'ok', resourcesGained: { wood: 3 } }
    },
  }),
})

export const C162_ForestOwner_impl = {
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
},
  reaches: [] as readonly string[],
} satisfies CardImpl
