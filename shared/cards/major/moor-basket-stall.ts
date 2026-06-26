import { defineMajorCard } from '../card-source'
import type { CardSourceMetaInput } from '../card-source'

const CARD_ID = 'Major_Moor_BasketStall'

export const Major_Moor_BasketStall = defineMajorCard({
  meta: {
    id: CARD_ID,
    name: 'Basket Stall',
    deck: 'major',
    number: 114,
    category: 'BUILDING_RESOURCE_PROVIDER',
    cost: { reed: 1, stone: 1 },
    vp: 2,
    extraVp: false,
    requiresFarmersOfTheMoor: true,
    desc: [
      '[Anytime]',
      'Exchange reed for the same amount of other building resources.',
    ],
    exchanges: [
      { from: { reed: 1 }, to: { wood: 1 }, sourceId: CARD_ID, triggers: ['anytime'] },
      { from: { reed: 1 }, to: { clay: 1 }, sourceId: CARD_ID, triggers: ['anytime'] },
      { from: { reed: 1 }, to: { stone: 1 }, sourceId: CARD_ID, triggers: ['anytime'] },
    ],
  } satisfies CardSourceMetaInput,
})
