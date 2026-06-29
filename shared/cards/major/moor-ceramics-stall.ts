import { defineMajorCard } from '../card-source'
import type { CardSourceMetaInput } from '../card-source'

const CARD_ID = 'Major_Moor_CeramicsStall'

export const Major_Moor_CeramicsStall = defineMajorCard({
  meta: {
    id: CARD_ID,
    name: 'Ceramics Stall',
    deck: 'major',
    number: 113,
    category: 'BUILDING_RESOURCE_PROVIDER',
    cost: { clay: 1, stone: 1 },
    vp: 2,
    extraVp: false,
    requiresFarmersOfTheMoor: true,
    desc: [
      '[Anytime]',
      '1<CLAY> <ARROW> 1<WOOD>',
    ],
    exchanges: [
      { from: { clay: 1 }, to: { wood: 1 }, sourceId: CARD_ID, triggers: ['anytime'] },
    ],
  } satisfies CardSourceMetaInput,
})
