import { registerPlayerActionSpace, createPlayerActionSpaces } from '../player-action-space'
import type { CardImpl } from '../registry'
import { E81_AlchemistsLab } from '../../cards-display/E/E81_AlchemistsLab'
export { E81_AlchemistsLab }

const CARD_ID = E81_AlchemistsLab.id

registerPlayerActionSpace({
  cardId: CARD_ID,
  access: 'all',
  createDefinition: (ownerId) => ({
    id: CARD_ID,
    nameKey: 'cards.E81_AlchemistsLab.name',
    descriptionKey: 'cards.E81_AlchemistsLab.desc',
    canBeExecutedByPlayer: (_state, player) => {
      // Non-owner must have at least 1 food to pay
      if (player.id !== ownerId && player.resources.food < 1) return false
      // Must have at least one building resource to gain anything
      const hasBuilding = (['wood', 'clay', 'reed', 'stone'] as const).some(
        (res) => player.resources[res] > 0,
      )
      return hasBuilding
    },
    execute: ({ state, player }) => {
      // Non-owner pays 1 food to the owner
      if (player.id !== ownerId) {
        player.resources.food -= 1
        const owner = state.players.find((p) => p.id === ownerId)
        if (owner) owner.resources.food += 1
      }
      // Gain 1 of each building resource the player already has
      const gained: Partial<Record<string, number>> = {}
      for (const res of ['wood', 'clay', 'reed', 'stone'] as const) {
        if (player.resources[res] > 0) {
          player.resources[res] += 1
          gained[res] = 1
        }
      }
      return { type: 'ok', resourcesGained: gained }
    },
  }),
})

export const E81_AlchemistsLab_impl = {
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
