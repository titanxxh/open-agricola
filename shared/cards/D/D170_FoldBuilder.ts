import { defineOccupationCard } from '../card-source'
import { canStartFencing } from '../../actions/effects/fencing'
import { createPlayerActionSpaces, registerPlayerActionSpace } from '../player-action-space'
import type { CardImpl } from '../registry'

const CARD_ID = 'D170_FoldBuilder'
const FOLD_BUILDER_FENCE_CONTEXT = {
  fencePolicy: { cancelPolicy: 'forbidCancel' },
}

registerPlayerActionSpace({
  cardId: CARD_ID,
  access: 'all',
  createDefinition: (ownerId) => ({
    id: CARD_ID,
    nameKey: `cards.${CARD_ID}.name`,
    descriptionKey: `cards.${CARD_ID}.desc`,
    strictCanExecute: true,
    canBeExecutedByPlayer: (state, player) => {
      if (player.id !== ownerId && (player.resources.food ?? 0) < 1) return false
      return canStartFencing(state, player, undefined, FOLD_BUILDER_FENCE_CONTEXT)
    },
    execute: ({ state, player }) => {
      if (player.id !== ownerId) {
        player.resources.food -= 1
        const owner = state.players.find((candidate) => candidate.id === ownerId)
        if (owner) owner.resources.food += 1
      }
      return {
        type: 'flow',
        flow: {
          type: 'seq',
          children: [
            {
              type: 'leaf',
              actionId: 'fence',
              sourceCard: CARD_ID,
              actionContext: FOLD_BUILDER_FENCE_CONTEXT,
            },
            { type: 'leaf', actionId: 'gain', params: { sheep: 1 }, sourceCard: CARD_ID },
          ],
        },
      }
    },
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

export const D170_FoldBuilder = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Fold Builder',
    deck: 'D',
    number: 170,
    category: 'FARM_PLANNER',
    desc: ['This card is an action space for all. It provides a "Build Fences" action and then 1 sheep. If another player uses it, they must first pay you 1 food.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const D170_FoldBuilder_impl = D170_FoldBuilder.impl
