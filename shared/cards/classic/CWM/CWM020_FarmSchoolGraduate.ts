import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import type { CardListenerRegistration } from '../../card-listeners'
import { countOccupations } from '../../helpers/prerequisites'

const CARD_ID = 'CWM020_FarmSchoolGraduate'

const noLessons: CardListenerRegistration = {
  id: CARD_ID + '-no-lessons',
  cardIds: [CARD_ID],
  globalQuery: true,
  phases: ['isDoable'],
  handler: (context) => (context.actionId.startsWith('lessons') ? { doable: false } : undefined),
}

const cardImpl = {
  listeners: [noLessons],
  prerequisiteCheck: (player) => countOccupations(player) === 0,
  effect: {
    id: CARD_ID,
    onStartHarvest: () => ({
      type: 'leaf',
      actionId: 'occupation',
      sourceCard: CARD_ID,
      optional: true,
      params: { exactCost: { food: 2 } },
    }),
  },
} satisfies CardImpl

export const CWM020_FarmSchoolGraduate = defineOccupationCard({
  meta: {
    id: 'CWM020_FarmSchoolGraduate',
    name: "Farm School Graduate",
    deck: 'CWM',
    number: 20,
    desc: ["This must be your first occupation. Afterwards, you may no longer use __Lessons__ action spaces. At the start of each harvest, you may pay 2 <FOOD> to play an occupation."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '1+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM020.png',
  },
  impl: cardImpl,
})

export const CWM020_FarmSchoolGraduate_impl = CWM020_FarmSchoolGraduate.impl
