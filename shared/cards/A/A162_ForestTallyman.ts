import { definePlayerActionCard } from '../card-source'
import { registerPlayerActionSpace, createPlayerActionSpaces } from '../player-action-space'
import { isSpaceOccupied } from '../../domain/space'
import type { CardImpl } from '../registry'

const CARD_ID = 'A162_ForestTallyman'

registerPlayerActionSpace({
  cardId: CARD_ID,
  access: 'owner',
  createDefinition: (ownerId) => ({
    id: CARD_ID,
    nameKey: 'cards.A162_ForestTallyman.name',
    descriptionKey: 'cards.A162_ForestTallyman.desc',
    canBeExecutedByPlayer: (state, player) => {
      if (player.id !== ownerId) return false
      const forest = state.actionSpaces.find((s) => s.id === 'forest')
      const clayPit = state.actionSpaces.find((s) => s.id === 'clay-pit')
      return !!(forest && clayPit && isSpaceOccupied(forest) && isSpaceOccupied(clayPit))
    },
    execute: ({ player }) => {
      player.resources.clay += 2
      player.resources.wood += 3
      return { type: 'ok', resourcesGained: { clay: 2, wood: 3 } }
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

export const A162_ForestTallyman = definePlayerActionCard({
  meta: {
    id: "A162_ForestTallyman",
    name: "Forest Tallyman",
    deck: "A",
    number: 162,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: ["Each time both the __Forest__ and __Clay Pit__ accumulation spaces are occupied, you can use this card as an action space to get 2 <CLAY> and 3 <WOOD>."],
    cost: {},
    players: "4+",
  },
  impl: cardImpl,
})

export const A162_ForestTallyman_impl = A162_ForestTallyman.impl
