import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isSpaceOccupied } from '../../domain/space'
import type { CardImpl } from '../registry'
import { LESSONS_SPACE_IDS } from '../helpers/lessons-spaces'

const CARD_ID = 'C131_PrivateTeacher'

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
        params: { exactCost: { food: 1 } },
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C131_PrivateTeacher = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Private Teacher',
    deck: 'C',
    number: 131,
    category: 'ACTIONS_BOOSTER',
    desc: ['Each time you use the __Grain Seeds__ action space when any __Lessons__ action space is occupied, you can also play an occupation for an occupation cost of 1 <FOOD>.'],
    cost: {},
    players: '3+',
  },
  impl: cardImpl,
})

export const C131_PrivateTeacher_impl = C131_PrivateTeacher.impl
