import { definePlayerActionCard } from '../card-source'
import { registerPlayerActionSpace, createPlayerActionSpaces, definePlayerActionSpaceFlow } from '../player-action-space'
import type { CardImpl } from '../registry'

const CARD_ID = 'E081_AlchemistsLab'
registerPlayerActionSpace({
  cardId: CARD_ID,
  access: 'all',
  createDefinition: (ownerId) => definePlayerActionSpaceFlow({
    id: CARD_ID,
    nameKey: 'cards.E081_AlchemistsLab.name',
    descriptionKey: 'cards.E081_AlchemistsLab.desc',
    canBeExecutedByPlayer: (_state, player) => {
      // Non-owner must have at least 1 food to pay
      if (player.id !== ownerId && player.resources.food < 1) return false
      // Must have at least one building resource to gain anything
      const hasBuilding = (['wood', 'clay', 'reed', 'stone'] as const).some(
        (res) => player.resources[res] > 0,
      )
      return hasBuilding
    },
    flowFactory: ({ player }) => ({ type: 'seq', children: [
      ...(player.id !== ownerId ? [{ type: 'leaf' as const, actionId: 'gain', sourceCard: CARD_ID,
        params: { food: 1, recipientPlayerId: ownerId, payerId: player.id } }] : []),
      { type: 'leaf', actionId: 'gain', sourceCard: CARD_ID, params: Object.fromEntries(
        (['wood', 'clay', 'reed', 'stone'] as const).filter(resource => player.resources[resource] > 0).map(resource => [resource, 1]),
      ) },
    ] }),
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

export const E081_AlchemistsLab = definePlayerActionCard({
  meta: {
    id: CARD_ID,
    name: "Alchemists Lab",
    deck: "E",
    number: 81,
    playerActionCardType: 'minor',
    desc: ["This card is an action space for all. A player who uses it gets 1 building resource of each type they already have. If another player uses it, they must first pay you 1 <FOOD>."],
    cost: {},
    prerequisite: "3 Occupations",
    occupationPrerequisites: {"min":3},
    vp: 1,
    category: 'BUILDING_RESOURCES_-_ALL',
  },
  impl: cardImpl,
})

export const E081_AlchemistsLab_impl = E081_AlchemistsLab.impl
