import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { createPlayerActionSpaces, registerPlayerActionSpace } from '../player-action-space'
import { isRoundSpaceOccupied } from '../helpers/round-action-topology'
import type { CardImpl } from '../registry'

const CARD_ID = 'D179_Bullcatcher'

registerPlayerActionSpace({
  cardId: CARD_ID,
  access: 'owner',
  createDefinition: (ownerId) => ({
    id: CARD_ID,
    nameKey: `cards.${CARD_ID}.name`,
    descriptionKey: `cards.${CARD_ID}.desc`,
    strictCanExecute: true,
    canBeExecutedByPlayer: (state, player) =>
      player.id === ownerId &&
      isRoundSpaceOccupied(state, 3) &&
      isRoundSpaceOccupied(state, 6),
    execute: () => ({
      type: 'flow',
      flow: gainLeaf(CARD_ID, { cattle: 1, food: 2 }),
    }),
  }),
})

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state) => {
      const newSpaces = createPlayerActionSpaces(state)
      for (const space of newSpaces) {
        if (!state.actionSpaces.some((entry) => entry.id === space.id)) {
          state.actionSpaces.push(space)
        }
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D179_Bullcatcher = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Bullcatcher',
    deck: 'D',
    number: 179,
    category: 'LIVESTOCK_PROVIDER',
    desc: ['When both action spaces on round spaces 3 and 6 are occupied, you can use this card with a person to get 1 <CATTLE> and 2 <FOOD>.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const D179_Bullcatcher_impl = D179_Bullcatcher.impl
