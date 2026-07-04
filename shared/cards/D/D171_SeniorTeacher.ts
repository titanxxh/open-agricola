import { defineOccupationCard } from '../card-source'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { sumActualPaidResource } from '../helpers/event-provenance'
import { isLessonsSpaceId } from '../helpers/lessons-spaces'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { CardImpl } from '../registry'

const CARD_ID = 'D171_SeniorTeacher'

const afterLessonsPayListener: CardListenerRegistration = {
  id: 'D171-senior-teacher-after-lessons-pay',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['pay'],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isLessonsSpaceId(context.space?.id)) return
    const owner = context.ownerPlayer
    const payer = context.triggerPlayer ?? context.player
    if (!owner || payer.id === owner.id) return
    const paidFood = sumActualPaidResource(
      context.actionEvents ?? context.transactionEvents,
      'food',
      (event) => event.paymentFor === 'occupation',
    )
    if (paidFood <= 0) return
    return { flow: gainLeaf(CARD_ID, { food: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [afterLessonsPayListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D171_SeniorTeacher = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Senior Teacher',
    deck: 'D',
    number: 171,
    category: 'ACTIONS_BOOSTER',
    desc: ['Each time another player pays <FOOD> on a __Lessons__ action space, you get exactly 1 of that <FOOD>.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const D171_SeniorTeacher_impl = D171_SeniorTeacher.impl
