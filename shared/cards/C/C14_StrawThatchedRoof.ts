import { defineMinorCard } from '../card-source'
import type { BonusModifier } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C14_StrawThatchedRoof'

/**
 * C14 Straw-Thatched Roof — You no longer need reed to renovate or build a room.
 *
 * BGA reference: removes reed from construct and renovation costs.
 * Prerequisite: 3 Grain Fields.
 *
 * We model reed removal as a large discount capped at the current reed cost.
 */

export const C14_StrawThatchedRoof = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Straw-Thatched Roof',
    deck: 'C',
    number: 14,
    category: 'FARM_PLANNER',
    desc: ['You no longer need <REED> to renovate or build a room.'],
    cost: {},
    vp: 1,
    prerequisite: '3 Grain Fields',
  },
  impl: {
  modifiers: [
    ...([
        {
          type: 'bonus',
          cardId: CARD_ID,
          appliesTo: ['construct'],
          discount: { reed: 99 },
          capDiscountAtCost: true,
        },
        {
          type: 'bonus',
          cardId: CARD_ID,
          appliesTo: ['renovation'],
          discount: { reed: 99 },
          capDiscountAtCost: true,
        },
      ] as BonusModifier[]),
  ],
} satisfies CardImpl,
})

export const C14_StrawThatchedRoof_impl = C14_StrawThatchedRoof.impl
