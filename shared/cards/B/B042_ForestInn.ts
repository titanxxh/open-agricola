import { definePlayerActionCard } from '../card-source'
import { registerPlayerActionSpace, createPlayerActionSpaces } from '../player-action-space'
import { payThenGainActionFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import type { ActionFlow } from '../../contract/types'

const CARD_ID = 'B042_ForestInn'
const exchangeFlow = (): ActionFlow => ({
  type: 'xor',
  promptKey: 'ui.interactionForestInn',
  children: [
    payThenGainActionFlow({
      cardId: CARD_ID,
      cost: { wood: 5 },
      gain: { wood: 8, food: 2 },
    }),
    payThenGainActionFlow({
      cardId: CARD_ID,
      cost: { wood: 7 },
      gain: { wood: 8, food: 4 },
    }),
    payThenGainActionFlow({
      cardId: CARD_ID,
      cost: { wood: 9 },
      gain: { wood: 8, food: 7 },
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
    nameKey: 'cards.B042_ForestInn.name',
    descriptionKey: 'cards.B042_ForestInn.desc',
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

export const B042_ForestInn = definePlayerActionCard({
  meta: {
    id: CARD_ID,
    name: "Forest Inn",
    deck: "B",
    number: 42,
    playerActionCardType: 'minor',
    category: "GOODS_PROVIDER",
    desc: ["This is an action space for all. A player who uses it can exchange 5/7/9 <WOOD> for 8 <WOOD> and 2/4/7 <FOOD>. When another player uses it, they must first pay you 1 <FOOD>."],
    cost: {"clay":1,"reed":1},
    vp: 1,
    prerequisite: "Play in Round 6 or Before",
    maxRound: 6,
    waresSalesmanGains: [{ wood: 1, reed: 1 }],
  },
  impl: cardImpl,
})

export const B042_ForestInn_impl = B042_ForestInn.impl
