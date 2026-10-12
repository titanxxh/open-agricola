import { definePlayerActionCard } from '../card-source'
import { registerPlayerActionSpace, createPlayerActionSpaces, definePlayerActionSpaceFlow } from '../player-action-space'
import type { CardImpl } from '../registry'

const CARD_ID = 'C162_ForestOwner'

registerPlayerActionSpace({
  cardId: CARD_ID,
  access: 'all',
  createDefinition: (ownerId) => definePlayerActionSpaceFlow({
    id: CARD_ID,
    nameKey: 'cards.C162_ForestOwner.name',
    descriptionKey: 'cards.C162_ForestOwner.desc',
    canBeExecutedByPlayer: () => true,
    flowFactory: ({ player }) => ({ type: 'seq', children: [
      { type: 'leaf', actionId: 'gain', sourceCard: CARD_ID, params: { wood: player.id === ownerId ? 4 : 3 } },
      ...(player.id !== ownerId ? [{ type: 'leaf' as const, actionId: 'gain', sourceCard: CARD_ID, targetPlayerId: ownerId,
        params: { wood: 1 }, actionContext: { sourceLocation: { kind: 'supply' } } }] : []),
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

export const C162_ForestOwner = definePlayerActionCard({
  meta: {
    id: "C162_ForestOwner",
    name: "Forest Owner",
    deck: "C",
    number: 162,
    playerActionCardType: 'occupation',
    category: "ACTIONS_BOOSTER",
    desc: ["This card is an action space for all. If another player uses it, they get 3 <WOOD> and must give you 1 <WOOD> from the general supply. If you use it, you get 4 <WOOD>."],
    cost: {},
    players: "4+",
  },
  impl: cardImpl,
})

export const C162_ForestOwner_impl = C162_ForestOwner.impl
