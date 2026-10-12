import { definePlayerActionCard } from '../card-source'
import { registerPlayerActionSpace, createPlayerActionSpaces, definePlayerActionSpaceFlow } from '../player-action-space'
import type { CardImpl } from '../registry'

const CARD_ID = 'A039_Chapel'

registerPlayerActionSpace({
  cardId: CARD_ID,
  access: 'all',
  createDefinition: (ownerId) => definePlayerActionSpaceFlow({
    id: CARD_ID,
    nameKey: 'cards.A039_Chapel.name',
    descriptionKey: 'cards.A039_Chapel.desc',
    canBeExecutedByPlayer: (_state, player) => {
      // Non-owner must have grain to pay
      if (player.id !== ownerId && player.resources.grain < 1) return false
      return true
    },
    flowFactory: ({ player }) => ({ type: 'seq', children: [
      ...(player.id !== ownerId ? [{ type: 'leaf' as const, actionId: 'gain', sourceCard: CARD_ID,
        params: { grain: 1, recipientPlayerId: ownerId, payerId: player.id } }] : []),
      ...Array.from({ length: 3 }, () => ({ type: 'leaf' as const, actionId: 'bonus-vp', sourceCard: CARD_ID })),
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

export const A039_Chapel = definePlayerActionCard({
  meta: {
    id: "A039_Chapel",
    name: "Chapel",
    deck: "A",
    number: 39,
    playerActionCardType: 'minor',
    category: "POINTS_PROVIDER",
    desc: ["This is an action space for all. A player who uses it gets 3 bonus <SCORE>. If another player uses it, they must first pay you 1 <GRAIN>."],
    cost: {"wood":3,"clay":2},
    prerequisite: "2 Occupations",
    occupationPrerequisites: {"min":2},
    extraVp: true,
    vp: 3,
  },
  presentation: { counters: ['bonusVp'] },
  impl: cardImpl,
})

export const A039_Chapel_impl = A039_Chapel.impl
