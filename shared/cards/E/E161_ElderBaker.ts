import { PlayerActionCard } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerPlayerActionSpace, createPlayerActionSpaces } from '../player-action-space'

const CARD_ID = 'E161_ElderBaker'

registerPlayerActionSpace({
  cardId: CARD_ID,
  access: 'owner',
  createDefinition: (ownerId) => ({
    id: CARD_ID,
    nameKey: 'cards.E161_ElderBaker.name',
    descriptionKey: 'cards.E161_ElderBaker.desc',
    canBeExecutedByPlayer: (_, player) => player.id === ownerId,
    execute: ({ player }) => {
      player.resources.grain += 3
      return { type: 'ok', resourcesGained: { grain: 3 } }
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

export const E161_ElderBaker = new PlayerActionCard({
  id: "E161_ElderBaker",
  name: "Elder Baker",
  deck: "E",
  number: 161,
  desc: ["This card is an action space for you only. When you use it, you get 3 <GRAIN>. You can build the __Stone Oven__ major improvement even when taking a __Minor Improvement__ action."],
  cost: {},
  players: "4+",
})
