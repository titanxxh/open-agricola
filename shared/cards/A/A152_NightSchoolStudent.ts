import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { isSpaceOccupied } from '../../game/space'

const CARD_ID = 'A152_NightSchoolStudent'

const LESSONS_SPACES = ['lessons', 'lessons-4']

// A152 Night-School Student: Each returning home phase in which no player returns a person
// from a Lessons action space, you can play an occupation for 1 food.
registerCardEffect({
  id: CARD_ID,
  onStartReturnHome: (state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
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
})

export const A152_NightSchoolStudent = new Occupation({
  id: CARD_ID,
  name: 'Night-School Student',
  deck: 'A',
  number: 152,
  category: 'ACTIONS_BOOSTER',
  desc: ['Each returning home phase in which no player returns a person from a __Lessons__ action space, you can play an occupation for an occupation cost of 1 <FOOD>.'],
  cost: {},
  players: '4+',
  newSet: true,
})
