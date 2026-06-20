import { defineMajorCard } from '../card-source'
import { createSingleHarvestExchange } from '../helpers/stage-effects'
import { scoreByResourceTiers } from './helpers'
import type { BonusScoringContext } from '../card-effects'
import type { GameState, PlayerState } from '../../contract/types'

const buildBasketImpl = (cardId: string) => ({
  effect: {
    id: cardId,
    onHarvest: createSingleHarvestExchange('reed', { food: 3 }, { sourceId: cardId }),
    computeBonusScore: (_state: GameState, player: PlayerState, _ctx: BonusScoringContext) =>
      scoreByResourceTiers(player.resources.reed ?? 0, [
        { min: 5, score: 3 },
        { min: 4, max: 4, score: 2 },
        { min: 2, max: 3, score: 1 },
      ]),
  },
})

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
  impl: buildBasketImpl('Major_Basket'),
})

export const Major_Basket2 = defineMajorCard({
  meta: {
  id: 'Major_Basket2',
  name: 'Basketmaker',
  deck: 'major',
  number: 18,
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
  impl: buildBasketImpl('Major_Basket2'),
})
