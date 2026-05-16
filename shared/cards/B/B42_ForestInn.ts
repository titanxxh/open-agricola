import { registerPlayerActionSpace, createPlayerActionSpaces } from '../player-action-space'
import { payThenGainActionFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import type { ActionFlow } from '../../contract/types'
import { B42_ForestInn } from '../../cards-display/B/B42_ForestInn'

const CARD_ID = B42_ForestInn.id

const exchangeFlow = (): ActionFlow => ({
  type: 'xor',
  promptKey: 'ui.interactionForestInn',
  children: [
    payThenGainActionFlow({
      cardId: CARD_ID,
      cost: { wood: 5 },
      gain: { wood: 8, food: 2 },
      choiceLabelKey: 'ui.interactionForestInn5',
    }),
    payThenGainActionFlow({
      cardId: CARD_ID,
      cost: { wood: 7 },
      gain: { wood: 8, food: 4 },
      choiceLabelKey: 'ui.interactionForestInn7',
    }),
    payThenGainActionFlow({
      cardId: CARD_ID,
      cost: { wood: 9 },
      gain: { wood: 8, food: 7 },
      choiceLabelKey: 'ui.interactionForestInn9',
    }),
  ],
})

const forestInnFlow = (ownerId: string, usedByOwner: boolean): ActionFlow => {
  const exchange = exchangeFlow()
  if (usedByOwner) return exchange
  return {
    type: 'seq',
    children: [
      {
        type: 'leaf',
        actionId: 'pay',
        params: { food: 1 },
        sourceCard: CARD_ID,
      },
      {
        type: 'leaf',
        actionId: 'gain',
        params: { food: 1 },
        sourceCard: CARD_ID,
        targetPlayerId: ownerId,
      },
      exchange,
    ],
  }
}

registerPlayerActionSpace({
  cardId: CARD_ID,
  access: 'all',
  createDefinition: (ownerId) => ({
    id: CARD_ID,
    nameKey: 'cards.B42_ForestInn.name',
    descriptionKey: 'cards.B42_ForestInn.desc',
    canBeExecutedByPlayer: (_state, player) => {
      if (player.id !== ownerId && player.resources.food < 1) return false
      return player.resources.wood >= 5
    },
    execute: ({ player }) => ({
      type: 'flow',
      flow: forestInnFlow(ownerId, player.id === ownerId),
    }),
  }),
})

export const B42_ForestInn_impl = {
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
