import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'D56_FatstockStretcher'

const beforeExchangeListener: CardListenerRegistration = {
  id: 'D56-fatstock-stretcher-before-exchange',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['anytime-exchange'],
  handler: (context): ActionHookResult | void => {
    writeCardExtraData(context.player, CARD_ID, 'sheepBefore', context.player.resources.sheep)
    writeCardExtraData(context.player, CARD_ID, 'boarBefore', context.player.resources.boar)
  },
}

const afterExchangeListener: CardListenerRegistration = {
  id: 'D56-fatstock-stretcher-after-exchange',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['anytime-exchange'],
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

registerCardListener(beforeExchangeListener)
registerCardListener(afterExchangeListener)

export const D56_FatstockStretcher = new MinorImprovement({
  id: CARD_ID,
  name: 'Fatstock Stretcher',
  deck: 'D',
  number: 56,
  category: 'FOOD_PROVIDER',
  desc: ['Each time you turn a <SHEEP> or <PIG> into <FOOD> using a cooking improvement, you get 1 additional <FOOD>.'],
  cost: { wood: 1 },
})
