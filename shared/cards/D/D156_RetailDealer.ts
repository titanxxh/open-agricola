import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../contract/types'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D156_RetailDealer'
const setRemainingLeaf = (value: number): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: CARD_ID,
  params: { kind: 'set-extra-data', key: 'remaining', value },
})

const listener: CardListenerRegistration = {
  id: 'D156-retail-dealer-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'resource-market-4') return
    const remaining = readCardExtraData<number>(context.player, CARD_ID, 'remaining') ?? 0
    if (remaining <= 0) return
    return {
      flow: {
        type: 'seq',
        children: [
          setRemainingLeaf(remaining - 1),
          gainLeaf(CARD_ID, { grain: 1, food: 1 }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    writeCardExtraData(player, CARD_ID, 'remaining', 3)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D156_RetailDealer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Retail Dealer',
    deck: 'D',
    number: 156,
    category: 'GOODS_PROVIDER',
    desc: ['Place 3 <GRAIN> and 3 <FOOD> on this card. Each time you use the __Resource Market__ action space, you also get 1 <GRAIN> and 1 <FOOD> from this card.'],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const D156_RetailDealer_impl = D156_RetailDealer.impl
