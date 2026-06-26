import { defineMajorCard } from '../card-source'
import type { CardSourceMetaInput } from '../card-source'

const CARD_ID = 'Major_Moor_FurnitureStall'

export const Major_Moor_FurnitureStall = defineMajorCard({
  meta: {
    id: CARD_ID,
    name: 'Furniture Stall',
    deck: 'major',
    number: 112,
    cost: { wood: 1, stone: 1 },
    vp: 2,
    extraVp: false,
    requiresFarmersOfTheMoor: true,
    desc: [
      '[Anytime]',
      'Exchange wood for the same amount of clay.',
    ],
    exchanges: [
      { from: { wood: 1 }, to: { clay: 1 }, sourceId: CARD_ID, triggers: ['anytime'] },
    ],
  } satisfies CardSourceMetaInput,
})
