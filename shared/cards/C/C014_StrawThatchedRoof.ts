import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'C014_StrawThatchedRoof'

/**
 * C14 Straw-Thatched Roof — You no longer need reed to renovate or build a room.
 *
 * BGA reference: removes reed from construct and renovation costs.
 * Prerequisite: 3 Grain Fields.
 */

export const C014_StrawThatchedRoof = defineMinorCard({
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
      {
        type: 'remove-resource',
        cardId: CARD_ID,
        appliesTo: ['construct', 'renovation'],
        resources: ['reed'],
      },
    ],
  } satisfies CardImpl,
})

export const C014_StrawThatchedRoof_impl = C014_StrawThatchedRoof.impl
