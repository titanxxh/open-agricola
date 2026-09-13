import { defineMajorCard } from '../card-source'
import { createSingleHarvestExchange } from '../helpers/stage-effects'
import type { BonusScoreLevel } from '../card-effects'
import type { GameState, PlayerState } from '../../contract/types'

const buildPotteryImpl = (cardId: string) => ({
  effect: {
    id: cardId,
    onHarvest: createSingleHarvestExchange('clay', { food: 2 }, { sourceId: cardId }),
    computeCostedBonus: (_state: GameState, player: PlayerState): BonusScoreLevel[] => [
      { cost: {}, score: 0 },
      ...[3, 5, 7].flatMap((amount, index) => player.resources.clay >= amount
        ? [{ cost: { clay: amount }, score: index + 1 }] : []),
    ],
  },
})

export const Major_Pottery = defineMajorCard({
  meta: {
  id: 'Major_Pottery',
  name: 'Pottery',
  deck: 'major',
  number: 9,
  cost: { clay: 2, stone: 2 },
  vp: 2,
  extraVp: true,
  potteryIdentity: true,
  waresSalesmanGains: [{ clay: 1, reed: 1 }],
  desc: [
    '[Harvest]',
    '<CLAY> <ARROW-1X> 2<FOOD>',
    '[Scoring]',
    '3/5/7<CLAY> <ARROW-1X> 1/2/3<SCORE>',
  ],
},
  impl: buildPotteryImpl('Major_Pottery'),
})

export const Major_Pottery2 = defineMajorCard({
  meta: {
  id: 'Major_Pottery2',
  name: 'Pottery',
  deck: 'major',
  number: 17,
  cost: { clay: 2, stone: 3 },
  vp: 2,
  extraVp: true,
  potteryIdentity: true,
  waresSalesmanGains: [{ clay: 1, reed: 1 }],
  desc: [
    '[Harvest]',
    '<CLAY> <ARROW-1X> 2<FOOD>',
    '[Scoring]',
    '3/5/7<CLAY> <ARROW-1X> 1/2/3<SCORE>',
  ],
},
  impl: buildPotteryImpl('Major_Pottery2'),
})
