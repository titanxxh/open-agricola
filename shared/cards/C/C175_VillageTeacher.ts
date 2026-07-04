import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { isLessonsSpaceId } from '../helpers/lessons-spaces'
import type { CardImpl } from '../registry'

const CARD_ID = 'C175_VillageTeacher'

const occupiedLessonsCount = (context: CardListenerContext) =>
  context.state.actionSpaces.filter((space) => isLessonsSpaceId(space.id) && space.takenBy.length > 0).length

const listener: CardListenerRegistration = {
  id: 'C175-village-teacher-after-lessons',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isLessonsSpaceId(context.space?.id)) return
    const count = occupiedLessonsCount(context)
    if (count === 1) return { flow: gainLeaf(CARD_ID, { food: 1 }), sourceCard: CARD_ID }
    if (count === 2) return { flow: gainLeaf(CARD_ID, { grain: 1 }), sourceCard: CARD_ID }
    if (count === 3) return { flow: gainLeaf(CARD_ID, { vegetable: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C175_VillageTeacher = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Village Teacher',
    deck: 'C',
    number: 175,
    category: 'CROP_PROVIDER',
    desc: ['Immediately after each time you use a __Lessons__ action space, if this is the 1st/2nd/3rd occupied __Lessons__ action space that round, you get 1 <FOOD>/<GRAIN>/<VEGETABLE>.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const C175_VillageTeacher_impl = C175_VillageTeacher.impl
