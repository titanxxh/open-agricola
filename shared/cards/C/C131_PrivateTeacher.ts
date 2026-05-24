import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isSpaceOccupied } from '../../domain/space'
import type { CardImpl } from '../registry'
import { C131_PrivateTeacher } from '../../cards-display/C/C131_PrivateTeacher'
import { LESSONS_SPACE_IDS } from '../helpers/lessons-spaces'

const CARD_ID = C131_PrivateTeacher.id

const listener: CardListenerRegistration = {
  id: 'C131-private-teacher-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'grain-seeds') return
    const lessonsOccupied = LESSONS_SPACE_IDS.some((id) => {
      const s = context.state.actionSpaces.find((space) => space.id === id)
      return !!s && isSpaceOccupied(s)
    })
    if (!lessonsOccupied) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'occupation',
        optional: true,
        sourceCard: CARD_ID,
        params: { costOverride: { food: 1 } },
      },
      sourceCard: CARD_ID,
    }
  },
}

export const C131_PrivateTeacher_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
