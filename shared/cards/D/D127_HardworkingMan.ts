import { PlayerActionCard } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerPlayerActionSpace, createPlayerActionSpaces } from '../player-action-space'

const CARD_ID = 'D127_HardworkingMan'

// Owner-only action space. Available only when every other player has more rooms.
// Provides Day Laborer, Building Rooms (construct), and Major Improvement actions (all three via xor).
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
      // xor of: Day Laborer (gain 2 food), construct (build 1 room), Major Improvement
      return {
        type: 'flow',
        flow: {
          type: 'xor',
          children: [
            { type: 'leaf', actionId: 'day-laborer', sourceCard: CARD_ID },
            { type: 'leaf', actionId: 'construct', sourceCard: CARD_ID },
            { type: 'leaf', actionId: 'improvement-any', sourceCard: CARD_ID },
          ],
        },
      }
    },
  }),
})

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, _player) => {
    const newSpaces = createPlayerActionSpaces(state)
    for (const space of newSpaces) {
      if (!state.actionSpaces.some((s) => s.id === space.id)) {
        state.actionSpaces.push(space)
      }
    }
  },
})

export const D127_HardworkingMan = new PlayerActionCard({
  id: CARD_ID,
  name: "Hardworking Man",
  deck: "D",
  number: 127,
  category: "FARM_PLANNER",
  desc: ["This card is an action space for you only. If each other player has more rooms than you, it provides the __Day Laborer__, __Building Rooms__, and __Major Improvement__ actions (all three)."],
  cost: {},
  players: "3+",
})
