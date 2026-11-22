import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { readCardExtraData, writeCardExtraData } from '../../helpers/card-state'
import { registerHarvestFeedingRequirementModifier } from '../../../actions/helpers/harvest-feeding-requirement'

const CARD_ID = 'CWM085_Fruitcake'

registerHarvestFeedingRequirementModifier(CARD_ID, ({ state, player, familySize }) =>
  readCardExtraData(player, CARD_ID, 'feedingPhase') === state.completedFeedingPhases
    ? -familySize
    : 0,
)

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      writeCardExtraData(player, CARD_ID, 'feedingPhase', state.completedFeedingPhases)
    },
  },
} satisfies CardImpl

export const CWM085_Fruitcake = defineMinorCard({
  meta: {
    id: 'CWM085_Fruitcake',
    name: "Fruitcake",
    deck: 'CWM',
    number: 85,
    desc: ["During the next harvest feeding phase only, each of your family members, including newborns, requires 1 less food."],
    cost: {
      wood: 1,
    },
    vp: 0,
    prerequisite: "2 occupations",
    occupationPrerequisites: {
      min: 2,
    },
    passing: false,
    extraVp: true,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM085.png',
  },
  impl: cardImpl,
})

export const CWM085_Fruitcake_impl = CWM085_Fruitcake.impl
