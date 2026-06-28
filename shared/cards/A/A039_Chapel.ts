import { definePlayerActionCard } from '../card-source'
import { registerPlayerActionSpace, createPlayerActionSpaces } from '../player-action-space'
import { incCounter } from '../__stubs__/helpers'
import type { CardImpl } from '../registry'

const CARD_ID = 'A039_Chapel'

registerPlayerActionSpace({
  cardId: CARD_ID,
  access: 'all',
  createDefinition: (ownerId) => ({
    id: CARD_ID,
    nameKey: 'cards.A039_Chapel.name',
    descriptionKey: 'cards.A039_Chapel.desc',
    canBeExecutedByPlayer: (_state, player) => {
      // Non-owner must have grain to pay
      if (player.id !== ownerId && player.resources.grain < 1) return false
      return true
    },
    execute: ({ state, player }) => {
      // Always: +3 bonus VP for the user
      incCounter(player, CARD_ID, 'bonusVp', 3)
      // Non-owner pays 1 grain to owner
      if (player.id !== ownerId) {
        player.resources.grain -= 1
        const owner = state.players.find((p) => p.id === ownerId)
        if (owner) owner.resources.grain += 1
      }
      return { type: 'ok' }
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

export const A039_Chapel = definePlayerActionCard({
  meta: {
    id: "A039_Chapel",
    name: "Chapel",
    deck: "A",
    number: 39,
    category: "POINTS_PROVIDER",
    desc: ["This is an action space for all. A player who uses it gets 3 bonus <SCORE>. If another player uses it, they must first pay you 1 <GRAIN>."],
    cost: {"wood":3,"clay":2},
    prerequisite: "2 Occupations",
    occupationPrerequisites: {"min":2},
    extraVp: true,
    vp: 3,
  },
  impl: cardImpl,
})

export const A039_Chapel_impl = A039_Chapel.impl
