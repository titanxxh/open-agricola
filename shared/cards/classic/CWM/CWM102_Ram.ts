import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { fixedCardAnimals } from '../../helpers/fixed-card-animals'
import { writeCardExtraData, ensureCardState } from '../../helpers/card-state'
import { writeAnimalHolderCounts } from '../../../domain/animal-holder-state'
import { registerHarvestFeedingRequirementModifier } from '../../../actions/helpers/harvest-feeding-requirement'
import { gainLeaf } from '../../helpers/pay-gain-node'

const CARD_ID = 'CWM102_Ram'

const fixed = fixedCardAnimals(CARD_ID)
registerHarvestFeedingRequirementModifier(CARD_ID, () => 1)
const cardImpl = {
  effect: {
    id: CARD_ID,
    ...fixed.effect,
    onBuy: (_state, player) => {
      writeCardExtraData(player, CARD_ID, 'fixedAnimals', { sheep: 1 })
      writeAnimalHolderCounts(ensureCardState(player, CARD_ID).extraData!, { sheep: 1 })
      return gainLeaf(CARD_ID, { sheep: 1 })
    },
    onRoundEnd: (state) =>
      [6, 8, 10, 12].includes(state.round)
        ? {
            type: 'leaf',
            actionId: 'breed',
            sourceCard: CARD_ID,
            actionContext: { sourceCard: CARD_ID, animalTypes: ['sheep'] },
          }
        : undefined,
  },
} satisfies CardImpl

export const CWM102_Ram = defineMinorCard({
  meta: {
    id: 'CWM102_Ram',
    name: "Ram",
    deck: 'CWM',
    number: 102,
    desc: ["The ram counts as a sheep for counts, scoring, and breeding. At the end of rounds 6, 8, 10, and 12, your sheep breed once more. Each harvest feeding phase, feed the ram 1 food or receive 1 begging card."],
    cost: {
      sheep: 1,
    },
    vp: 1,
    prerequisite: "",
    players: '1+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM102.png',
  },
  impl: cardImpl,
})

export const CWM102_Ram_impl = CWM102_Ram.impl
