import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { fieldHasCrop, fieldFindStackOfKind } from '../../game/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'A113_HeresyTeacher'
const LESSONS_SPACES = new Set(['lessons', 'lessons-4'])

// A113 Heresy Teacher: Each time you use a Lessons action space, you get 1 vegetable
// in each of your fields with at least 3 grain and no vegetable. Place the vegetable
// below the grain. (BGA unimplemented; emulated via after place-farmer listener.)

const listener: CardListenerRegistration = {
  id: 'A113-heresy-teacher-after-lessons',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || !LESSONS_SPACES.has(context.space.id)) return
    for (const field of context.player.fields) {
      const grain = fieldFindStackOfKind(field, 'grain')
      const hasVeg = fieldHasCrop(field, 'vegetable')
      if (grain && grain.remaining >= 3 && !hasVeg) {
        field.stacks.unshift({ kind: 'vegetable', remaining: 1 })
      }
    }
  },
}

export const A113_HeresyTeacher = new Occupation({
  id: CARD_ID,
  name: 'Heresy Teacher',
  deck: 'A',
  number: 113,
  category: 'CROP_PROVIDER',
  desc: [
    'Each time you use a "Lessons" action space, you get 1 <VEGETABLE> in each of your fields with at least 3 <GRAIN> and no <VEGETABLE>. Place the <VEGETABLE> below the <GRAIN>.',
  ],
  cost: {},
  players: '1+',
})

export const A113_HeresyTeacher_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
