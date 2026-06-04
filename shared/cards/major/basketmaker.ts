import { defineMajorCard } from '../card-source'
import { createSingleHarvestExchange } from '../helpers/stage-effects'
import { scoreByResourceTiers } from './helpers'

export const Major_Basket = defineMajorCard({
  meta: {
  id: 'Major_Basket',
  name: 'Basketmaker',
  deck: 'major',
  number: 10,
  cost: { reed: 2, stone: 2 },
  vp: 2,
  extraVp: true,
  waresSalesmanGains: [{ reed: 2 }],
  desc: [
    '[Harvest]',
    '<REED> <ARROW-1X> 3<FOOD>',
    '[Scoring]',
    '2/4/5<REED> <ARROW-1X> 1/2/3<SCORE>',
  ],
},
  impl: {
    effect: {
      id: 'Major_Basket',
      onHarvest: createSingleHarvestExchange('reed', { food: 3 }),
      computeBonusScore: (_state, player) =>
        scoreByResourceTiers(player.resources.reed ?? 0, [
          { min: 5, score: 3 },
          { min: 4, max: 4, score: 2 },
          { min: 2, max: 3, score: 1 },
        ]),
    },
  },
})
