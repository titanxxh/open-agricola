import { defineMajorCard } from '../card-source'
import type { CardSourceMetaInput } from '../card-source'
import type { CardImpl } from '../registry'
import { gainLeaf } from '../helpers/pay-gain-node'
import { createSingleHarvestExchange } from '../helpers/stage-effects'

const CARD_ID = 'Major_Moor_VillageChurch'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: () => gainLeaf(CARD_ID, { food: 2 }),
    onHarvest: createSingleHarvestExchange(CARD_ID),
  },
} satisfies CardImpl

export const Major_Moor_VillageChurch = defineMajorCard({
  meta: {
    id: CARD_ID,
    name: 'Village Church',
    deck: 'major',
    number: 111,
    category: 'POINTS_PROVIDER',
    cost: { wood: 2, stone: 4 },
    vp: 4,
    extraVp: true,
    exchanges: [{
      from: { fuel: 1 }, to: {}, max: 1, sourceId: CARD_ID, triggers: ['harvest'],
      sideEffect: { type: 'bonusVp', amount: 1 },
    }],
    requiresFarmersOfTheMoor: true,
    desc: [
      '[Harvest]',
      '1<FUEL> <ARROW-1X> 1<SCORE>',
      'Immediately gain 2<FOOD>.',
    ],
  } satisfies CardSourceMetaInput,
  presentation: { counters: ['bonusVp'] },
  impl: cardImpl,
})
