import type { CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D56_FatstockStretcher } from '../../cards-display/D/D56_FatstockStretcher'

const CARD_ID = D56_FatstockStretcher.id

const beforeExchangeListener: CardListenerRegistration = {
  id: 'D56-fatstock-stretcher-before-exchange',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['exchange'],
  handler: (context): ActionHookResult | void => {
    writeCardExtraData(context.player, CARD_ID, 'sheepBefore', context.player.resources.sheep)
    writeCardExtraData(context.player, CARD_ID, 'boarBefore', context.player.resources.boar)
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

export const D56_FatstockStretcher_impl = {
  listeners: [beforeExchangeListener, afterExchangeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
