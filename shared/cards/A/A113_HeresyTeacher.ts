import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { fieldHasCrop, fieldFindStackOfKind } from '../../domain/field'
import type { CardImpl } from '../registry'
import { A113_HeresyTeacher } from '../../cards-display/A/A113_HeresyTeacher'

const CARD_ID = A113_HeresyTeacher.id

const LESSONS_SPACES = new Set(['lessons', 'lessons-4'])

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

export const A113_HeresyTeacher_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
