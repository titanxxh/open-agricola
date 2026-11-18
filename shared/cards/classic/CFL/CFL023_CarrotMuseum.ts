import { fieldHasCrop } from '../../../domain/field'
import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { getLogicalFields } from '../../helpers/card-field'
import { gainLeaf } from '../../helpers/pay-gain-node'

const CARD_ID = 'CFL023_CarrotMuseum'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onAfterRoundEnd: (state, player) => {
      if (![8, 10, 12].includes(state.round)) return
      const stone = getLogicalFields(player).filter((field) =>
        fieldHasCrop(field, 'vegetable'),
      ).length
      const wood = player.resources.vegetable
      if (stone + wood > 0) return gainLeaf(CARD_ID, { stone, wood })
    },
  },
} satisfies CardImpl

export const CFL023_CarrotMuseum = defineMinorCard({
  meta: {
    id: 'CFL023_CarrotMuseum',
    name: 'Carrot Museum',
    deck: 'CFL',
    number: 23,
    cost: {
      wood: 2,
      clay: 2,
    },
    vp: 1,
    desc: [
      'At the end of rounds 8, 10, and 12, you get 1 <STONE> for each vegetable field and 1 <WOOD> for each <VEGETABLE> in your supply.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL023.png',
    maxRound: 7,
    prerequisite: 'Round 7 or earlier',
  },
  impl: cardImpl,
})
