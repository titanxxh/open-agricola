import { definePlayerActionCard } from '../card-source'
import { registerPlayerActionSpace, createPlayerActionSpaces } from '../player-action-space'
import type { CardImpl } from '../registry'

const CARD_ID = 'E81_AlchemistsLab'
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

const cardImpl = {
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

export const E81_AlchemistsLab = definePlayerActionCard({
  meta: {
    id: CARD_ID,
    name: "Alchemists Lab",
    deck: "E",
    number: 81,
    desc: ["This card is an action space for all. A player who uses it gets 1 building resource of each type they already have. If another player uses it, they must first pay you 1 <FOOD>."],
    cost: {},
    prerequisite: "3 Occupations",
    occupationPrerequisites: {"min":3},
    vp: 1,
    category: 'BUILDING_RESOURCES_-_ALL',
  },
  impl: cardImpl,
})

export const E81_AlchemistsLab_impl = E81_AlchemistsLab.impl
