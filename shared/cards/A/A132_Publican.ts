import { Occupation } from '../types'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A132_Publican'

const isUnconditionalSow = (context: CardListenerContext) => {
  const actionContext = context.actionContext ?? {}
  if (actionContext.checkedReplaceAction === true) return false
  return actionContext.maxSelections === undefined && actionContext.cropType === undefined
}

const listener: CardListenerRegistration = {
  id: 'A132-publican-before-opponent-sow',
  cardIds: [CARD_ID],
  actions: ['sow'],
  phases: ['before' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isUnconditionalSow(context)) return
    const triggerPlayerId = context.triggerPlayer?.id ?? context.player.id
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { grain: 1 } }),
          {
            type: 'leaf',
            actionId: 'gain-trigger-player',
            params: { grain: 1, targetPlayerId: triggerPlayerId },
            sourceCard: CARD_ID,
          },
          {
            type: 'leaf',
            actionId: 'bonus-vp',
            sourceCard: CARD_ID,
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const A132_Publican = new Occupation({
  id: CARD_ID,
  name: 'Publican',
  deck: 'A',
  number: 132,
  category: 'POINTS_PROVIDER',
  desc: [
    'Each time before another player takes an unconditional __Sow__ action, you can give them 1 <GRAIN> from your supply to get 1 bonus <SCORE>.',
  ],
  cost: {},
  players: '3+',
  extraVp: true,
})

export const A132_Publican_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
