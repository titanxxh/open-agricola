import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { createSingleHarvestExchange } from '../../helpers/stage-effects'
import type { ActionFlow } from '../../../contract/types'

const CARD_ID = 'CWM066_Brazier'

const RECIPES = [['vegetable', 3], ['sheep', 2], ['boar', 3], ['cattle', 4]] as const

const cardImpl = {
  effect: {
    id: CARD_ID,
    // Standard exchanges, so exchange reactions (e.g. CI097_Slaughterhouse) see the conversion.
    onHarvestFeedingPhase: (state, player) => {
      const children = RECIPES.flatMap(([good, food]) => {
        const leaf = createSingleHarvestExchange(CARD_ID, () => ({
          from: { [good]: 1 }, to: { food }, max: 1, sourceId: CARD_ID, triggers: ['harvest'],
        }))(state, player)
        return leaf
          ? [{
              ...leaf,
              optional: false,
              choiceLabelKey: `resources.${good}`,
            } as ActionFlow]
          : []
      })
      return children.length ? { type: 'xor', optional: true, children } : undefined
    },
  },
} satisfies CardImpl

export const CWM066_Brazier = defineMinorCard({
  meta: {
    isCookery: true,

    id: 'CWM066_Brazier',
    name: "Brazier",
    deck: 'CWM',
    number: 66,
    desc: ["During each harvest feeding phase, you may convert at most one good to <FOOD>: 1 <VEGETABLE> for 3 <FOOD>, 1 <SHEEP> for 2 <FOOD>, 1 <BOAR> for 3 <FOOD>, or 1 <CATTLE> for 4 <FOOD>."],
    cost: {
      wood: 1,
      clay: 1,
    },
    vp: 1,
    prerequisite: "",
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM066.png',
  },
  impl: cardImpl,
})

export const CWM066_Brazier_impl = CWM066_Brazier.impl
