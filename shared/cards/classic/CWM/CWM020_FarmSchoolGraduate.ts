import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { countOccupations } from '../../helpers/prerequisites'

const CARD_ID = 'CWM020_FarmSchoolGraduate'

const cardImpl = {
  prerequisiteCheck: (player) => countOccupations(player) === 0,
  effect: {
    id: CARD_ID,
    permitsActionSpaceEntry: (_state, owner, actor, spaceId) =>
      owner.id !== actor.id || !spaceId.startsWith('lessons'),
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
    desc: ["This must be your first occupation. Afterwards, you may no longer use Lessons action spaces. At the start of each harvest, you may pay 2 food to play an occupation."],
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
