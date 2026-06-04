import { defineOccupationCard } from '../card-source'
import { isSpaceOccupied } from '../../domain/space'
import { LESSONS_SPACE_IDS } from '../helpers/lessons-spaces'
import type { CardImpl } from '../registry'

const CARD_ID = 'A152_NightSchoolStudent'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onStartReturnHome: (state, player) => {
    // Check if any lessons space is occupied
    const lessonsOccupied = LESSONS_SPACE_IDS.some((id) => {
      const s = state.actionSpaces.find((space) => space.id === id)
      return !!s && isSpaceOccupied(s)
    })
    if (lessonsOccupied) return
    if (player.occupationHand.length === 0) return
    return {
      type: 'leaf',
      actionId: 'occupation',
      optional: true,
      sourceCard: CARD_ID,
      params: { exactCost: { food: 1 } },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A152_NightSchoolStudent = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Night-School Student',
    deck: 'A',
    number: 152,
    category: 'ACTIONS_BOOSTER',
    desc: ['Each returning home phase in which no player returns a person from a __Lessons__ action space, you can play an occupation for an occupation cost of 1 <FOOD>.'],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const A152_NightSchoolStudent_impl = A152_NightSchoolStudent.impl
