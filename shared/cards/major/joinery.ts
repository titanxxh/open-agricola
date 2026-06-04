import { defineMajorCard } from '../card-source'
import { createSingleHarvestExchange } from '../helpers/stage-effects'
import { scoreByResourceTiers } from './helpers'

export const Major_Joinery = defineMajorCard({
  meta: {
  id: 'Major_Joinery',
  name: 'Joinery',
  deck: 'major',
  number: 8,
  cost: { wood: 2, stone: 2 },
  vp: 2,
  extraVp: true,
  waresSalesmanGains: [{ wood: 1, reed: 1 }],
  desc: [
    '[Harvest]',
    '<WOOD> <ARROW-1X> 2<FOOD>',
    '[Scoring]',
    '3/5/7<WOOD> <ARROW-1X> 1/2/3<SCORE>',
  ],
},
  impl: {
    effect: {
      id: 'Major_Joinery',
      onHarvest: createSingleHarvestExchange('wood', { food: 2 }, { sourceId: 'Major_Joinery' }),
      computeBonusScore: (_state, player) =>
        scoreByResourceTiers(player.resources.wood ?? 0, [
          { min: 7, score: 3 },
          { min: 5, max: 6, score: 2 },
          { min: 3, max: 4, score: 1 },
        ]),
    },
  },
})
