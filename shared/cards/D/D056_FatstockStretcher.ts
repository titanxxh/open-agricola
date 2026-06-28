import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D056_FatstockStretcher'
const beforeExchangeListener: CardListenerRegistration = {
  id: 'D56-fatstock-stretcher-before-exchange',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['exchange'],
  handler: (context): ActionHookResult | void => {
    return {
      flow: {
        type: 'seq',
        children: [
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'set-extra-data', key: 'sheepBefore', value: context.player.resources.sheep },
          },
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'set-extra-data', key: 'boarBefore', value: context.player.resources.boar },
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const afterExchangeListener: CardListenerRegistration = {
  id: 'D56-fatstock-stretcher-after-exchange',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['exchange'],
  handler: (context): ActionHookResult | void => {
    const sheepBefore = readCardExtraData<number>(context.player, CARD_ID, 'sheepBefore') ?? 0
    const boarBefore = readCardExtraData<number>(context.player, CARD_ID, 'boarBefore') ?? 0
    const sheepLost = sheepBefore - context.player.resources.sheep
    const boarLost = boarBefore - context.player.resources.boar
    const bonus = Math.max(0, sheepLost) + Math.max(0, boarLost)
    if (bonus <= 0) return
    return {
      flow: gainLeaf(CARD_ID, { food: bonus }),
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [beforeExchangeListener, afterExchangeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D056_FatstockStretcher = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Fatstock Stretcher',
    deck: 'D',
    number: 56,
    category: 'FOOD_PROVIDER',
    desc: ['Each time you turn a <SHEEP> or <PIG> into <FOOD> using a cooking improvement, you get 1 additional <FOOD>.'],
    cost: { wood: 1 },
  },
  impl: cardImpl,
})

export const D056_FatstockStretcher_impl = D056_FatstockStretcher.impl
