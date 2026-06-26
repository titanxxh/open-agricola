import { defineMajorCard } from '../card-source'
import type { CardSourceMetaInput } from '../card-source'

const CARD_ID = 'Major_Moor_CeramicsStall'

export const Major_Moor_CeramicsStall = defineMajorCard({
  meta: {
    id: CARD_ID,
    name: 'Ceramics Stall',
    deck: 'major',
    number: 113,
    cost: { clay: 1, stone: 1 },
    vp: 2,
    extraVp: false,
    requiresFarmersOfTheMoor: true,
    desc: [
      '[Anytime]',
      'Exchange clay for the same amount of wood.',
    ],
    exchanges: [
      { from: { clay: 1 }, to: { wood: 1 }, sourceId: CARD_ID, triggers: ['anytime'] },
    ],
  } satisfies CardSourceMetaInput,
})
