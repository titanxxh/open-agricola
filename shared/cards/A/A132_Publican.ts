import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { isUnconditionalSow } from '../../actions/effects/sow'
import { buildSowFarmInteraction } from '../../domain/farmyard-interaction'

const CARD_ID = 'A132_Publican'

const listener: CardListenerRegistration = {
  id: 'A132-publican-before-opponent-sow',
  cardIds: [CARD_ID],
  actions: ['sow'],
  phases: ['before' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isUnconditionalSow(context.actionContext)) return
    const farm = buildSowFarmInteraction(context.player, context.actionContext)
    if (farm.farmType !== 'sow' || farm.selectableFields.length === 0) return
    const triggerPlayerId = context.triggerPlayer?.id ?? context.player.id
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { grain: 1 } }),
          {
            type: 'leaf',
            actionId: 'gain',
            params: { grain: 1, recipientPlayerId: triggerPlayerId },
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

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A132_Publican = defineOccupationCard({
  meta: {
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
  },
  impl: cardImpl,
})

export const A132_Publican_impl = A132_Publican.impl
