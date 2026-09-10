import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../contract/types'
import { readCardExtraData, writeCardExtraData, writeCardInfobox } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E051_WhaleOil'
const updateInfobox = (player: Parameters<typeof writeCardInfobox>[0], count: number) => {
  writeCardInfobox(player, CARD_ID, `${count} Food`)
}

const specialEffect = (params: Record<string, unknown>): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: CARD_ID,
  params,
})

const setStoredFoodFlow = (count: number): ActionFlow[] => [
  specialEffect({ kind: 'set-extra-data', key: 'foodCount', value: count }),
  specialEffect({ kind: 'set-infobox', text: `${count} Food` }),
]

const fishingListener: CardListenerRegistration = {
  id: 'E51-whale-oil-after-collect-fishing',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // Check if this is the Fishing action space
    if (context.space?.id !== 'fishing') return
    const foodCount = readCardExtraData<number>(context.player, CARD_ID, 'foodCount') ?? 0
    const newCount = foodCount + 1
    return {
      flow: {
        type: 'seq',
        children: setStoredFoodFlow(newCount),
      },
      sourceCard: CARD_ID,
    }
  },
}

const occupationListener: CardListenerRegistration = {
  id: 'E51-whale-oil-before-occupation',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const foodCount = readCardExtraData<number>(context.player, CARD_ID, 'foodCount') ?? 0
    if (foodCount <= 0) return
    return {
      flow: gainLeaf(CARD_ID, { food: foodCount }),
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [fishingListener, occupationListener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    writeCardExtraData(player, CARD_ID, 'foodCount', 0)
    updateInfobox(player, 0)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E051_WhaleOil = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Whale Oil',
    deck: 'E',
    number: 51,
    category: 'FOOD',
    desc: ['Each time you use __Fishing__, place 1 <FOOD> from the general supply on this card. Each time before you play an occupation, you get <FOOD> equal to the amount on this card.'],
    cost: { wood: 1 },
  },
  impl: cardImpl,
})

export const E051_WhaleOil_impl = E051_WhaleOil.impl
