import { isSpaceOccupied } from '../../domain/space'
import type { CardImpl } from '../registry'
import { A152_NightSchoolStudent } from '../../cards-display/A/A152_NightSchoolStudent'
export { A152_NightSchoolStudent }

const CARD_ID = A152_NightSchoolStudent.id

const LESSONS_SPACES = ['lessons', 'lessons-4']

export const A152_NightSchoolStudent_impl = {
  effect: {
  id: CARD_ID,
  onStartReturnHome: (state, player) => {
    // Check if any lessons space is occupied
    const lessonsOccupied = LESSONS_SPACES.some((id) => {
      const s = state.actionSpaces.find((space) => space.id === id)
      return !!s && isSpaceOccupied(s)
    })
    if (lessonsOccupied) return
    if (player.occupationHand.length === 0) return
    return {
      type: 'leaf',
      actionId: 'play-occupation',
      optional: true,
      sourceCard: CARD_ID,
      params: { costOverride: { food: 1 } },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
