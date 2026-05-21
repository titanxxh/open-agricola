import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { D28_WritingDesk } from '../../cards-display/D/D28_WritingDesk'
import { isLessonsSpaceId } from '../helpers/lessons-spaces'

const CARD_ID = D28_WritingDesk.id

const listener: CardListenerRegistration = {
  id: 'D28-writing-desk-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (!isLessonsSpaceId(spaceId)) return
    // Need at least 2 occupations in hand (one for main Lessons, one for Writing Desk)
    if ((context.player.occupationHand?.length ?? 0) < 2) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'play-occupation',
        optional: true,
        sourceCard: CARD_ID,
        params: { costOverride: { food: 2 } },
      },
      sourceCard: CARD_ID,
    }
  },
}

export const D28_WritingDesk_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
