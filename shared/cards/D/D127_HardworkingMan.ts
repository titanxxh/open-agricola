import { definePlayerActionCard } from '../card-source'
import { registerPlayerActionSpace, createPlayerActionSpaces } from '../player-action-space'
import type { CardImpl } from '../registry'

const CARD_ID = 'D127_HardworkingMan'
registerPlayerActionSpace({
  cardId: CARD_ID,
  access: 'owner',
  createDefinition: (ownerId) => ({
    id: CARD_ID,
    nameKey: 'cards.D127_HardworkingMan.name',
    descriptionKey: 'cards.D127_HardworkingMan.desc',
    canBeExecutedByPlayer: (state, player) => {
      if (player.id !== ownerId) return false
      const otherPlayers = state.players.filter((p) => p.id !== player.id)
      return otherPlayers.length > 0 && otherPlayers.every((p) => p.rooms > player.rooms)
    },
    execute: () => {
      // BGA NODE_OR: all three children may be executed (in any subset).
      return {
        type: 'flow',
        flow: {
          type: 'or',
          children: [
            { type: 'leaf', actionId: 'day-laborer', sourceCard: CARD_ID },
            { type: 'leaf', actionId: 'construct', sourceCard: CARD_ID },
            { type: 'leaf', actionId: 'improvement', sourceCard: CARD_ID },
          ],
        },
      }
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

export const D127_HardworkingMan = definePlayerActionCard({
  meta: {
    id: CARD_ID,
    name: "Hardworking Man",
    deck: "D",
    number: 127,
    playerActionCardType: 'occupation',
    category: "FARM_PLANNER",
    desc: ["This card is an action space for you only. If each other player has more rooms than you, it provides the __Day Laborer__, __Building Rooms__, and __Major Improvement__ actions (all three)."],
    cost: {},
    players: "3+",
  },
  impl: cardImpl,
})

export const D127_HardworkingMan_impl = D127_HardworkingMan.impl
