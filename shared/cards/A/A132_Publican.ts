import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { isUnconditionalSow } from '../../actions/effects/sow'
import { buildSowFarmInteraction } from '../../domain/farmyard-interaction'

const CARD_ID = 'A132_Publican'

const canSowReceivedGrain = (context: CardListenerContext): boolean => {
  const player = {
    ...context.player,
    resources: {
      ...context.player.resources,
      grain: context.player.resources.grain + 1,
    },
  }
  const farm = buildSowFarmInteraction(player, context.actionContext)
  return farm.farmType === 'sow' && farm.selectableFields
    .some((field) => field.allowedCrops.includes('grain'))
}

const beforeSowListener: CardListenerRegistration = {
  id: 'A132-publican-before-opponent-sow',
  cardIds: [CARD_ID],
  actions: ['sow'],
  phases: ['before' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isUnconditionalSow(context.actionContext)) return
    if (!canSowReceivedGrain(context)) return
    if ((context.ownerPlayer?.resources.grain ?? 0) < 1) return
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

const isDoableListener: CardListenerRegistration = {
  id: 'A132-publican-isdoable-opponent-sow',
  cardIds: [CARD_ID],
  actions: ['sow'],
  phases: ['isDoable' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.doable) return
    if (context.actionContext?.skipBeforeTriggers === true) return
    if (!isUnconditionalSow(context.actionContext)) return
    if (!canSowReceivedGrain(context)) return
    if ((context.ownerPlayer?.resources.grain ?? 0) < 1) return
    return { doable: true }
  },
}

const cardImpl = {
  listeners: [beforeSowListener, isDoableListener],
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
  presentation: { counters: ['bonusVp'] },
  impl: cardImpl,
})

export const A132_Publican_impl = A132_Publican.impl
