import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../contract/types'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D156_RetailDealer } from '../../cards-display/D/D156_RetailDealer'

const CARD_ID = D156_RetailDealer.id

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

export const D156_RetailDealer_impl = {
  listeners: [listener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    writeCardExtraData(player, CARD_ID, 'remaining', 3)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
