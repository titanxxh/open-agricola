import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CWM078_FarmSchool'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onEndHarvestFieldPhase: (state, player) =>
      Object.values(state.harvestReapSummary?.[player.id]?.resources ?? {}).reduce(
        (sum, amount) => sum + (amount ?? 0),
        0,
      ) >= 2
        ? {
            type: 'leaf',
            actionId: 'occupation',
            sourceCard: CARD_ID,
            optional: true,
            params: { exactCost: { food: 2 } },
          }
        : undefined,
  },
} satisfies CardImpl

export const CWM078_FarmSchool = defineMinorCard({
  meta: {
    id: 'CWM078_FarmSchool',
    name: "Farm School",
    deck: 'CWM',
    number: 78,
    desc: ["During each harvest field phase, if you harvested at least 2 goods, you may pay 2 <FOOD> to play an occupation. Goods harvested from card <FIELD> count; an extra field phase supplied by a card does not."],
    cost: {
      wood: 1,
      reed: 1,
    },
    vp: 1,
    prerequisite: "2 occupations",
    occupationPrerequisites: {
      min: 2,
    },
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM078.png',
  },
  impl: cardImpl,
})

export const CWM078_FarmSchool_impl = CWM078_FarmSchool.impl
