import { defineMajorCard } from '../card-source'
import type { CardSourceMetaInput } from '../card-source'

const CARD_ID = 'Major_Moor_TiledOven'

export const Major_Moor_TiledOven = defineMajorCard({
  meta: {
    id: CARD_ID,
    name: 'Tiled Oven',
    deck: 'major',
    number: 110,
    category: 'GOODS_PROVIDER',
    cost: { clay: 2, stone: 1 },
    vp: 1,
    extraVp: false,
    ovenIdentity: true,
    requiresFarmersOfTheMoor: true,
    heatingFuelCap: 1,
    desc: [
      'Regardless of house size, you need at most 1<FUEL> to heat your entire home.',
    ],
  } satisfies CardSourceMetaInput,
})
