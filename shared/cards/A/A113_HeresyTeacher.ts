import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { fieldHasCrop, fieldFindStackOfKind } from '../../domain/field'
import { isLessonsSpaceId } from '../helpers/lessons-spaces'
import type { CardImpl } from '../registry'

const CARD_ID = 'A113_HeresyTeacher'
const listener: CardListenerRegistration = {
  id: 'A113-heresy-teacher-after-lessons',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || !isLessonsSpaceId(context.space.id)) return
    for (const field of context.player.fields) {
      const grain = fieldFindStackOfKind(field, 'grain')
      const hasVeg = fieldHasCrop(field, 'vegetable')
      if (grain && grain.remaining >= 3 && !hasVeg) {
        field.stacks.unshift({ kind: 'vegetable', remaining: 1 })
      }
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A113_HeresyTeacher = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Heresy Teacher',
    deck: 'A',
    number: 113,
    category: 'CROP_PROVIDER',
    desc: [
        'Each time you use a __Lessons__ action space, you get 1 <VEGETABLE> in each of your <FIELD> with at least 3 <GRAIN> and no <VEGETABLE>. Place the <VEGETABLE> below the <GRAIN>.',
      ],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const A113_HeresyTeacher_impl = A113_HeresyTeacher.impl
