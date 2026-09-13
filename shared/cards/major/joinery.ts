import { defineMajorCard } from '../card-source'
import { createSingleHarvestExchange } from '../helpers/stage-effects'
import type { BonusScoreLevel } from '../card-effects'
import type { GameState, PlayerState } from '../../contract/types'

const buildJoineryImpl = (cardId: string) => ({
  effect: {
    id: cardId,
    onHarvest: createSingleHarvestExchange('wood', { food: 2 }, { sourceId: cardId }),
    computeCostedBonus: (_state: GameState, player: PlayerState): BonusScoreLevel[] => [
      { cost: {}, score: 0 },
      ...[3, 5, 7].flatMap((amount, index) => player.resources.wood >= amount
        ? [{ cost: { wood: amount }, score: index + 1 }] : []),
    ],
  },
})

export const Major_Joinery = defineMajorCard({
  meta: {
  id: 'Major_Joinery',
  name: 'Joinery',
  deck: 'major',
  number: 8,
  cost: { wood: 2, stone: 2 },
  vp: 2,
  extraVp: true,
  joineryIdentity: true,
  waresSalesmanGains: [{ wood: 1, reed: 1 }],
  desc: [
    '[Harvest]',
    '<WOOD> <ARROW-1X> 2<FOOD>',
    '[Scoring]',
    '3/5/7<WOOD> <ARROW-1X> 1/2/3<SCORE>',
  ],
},
  impl: buildJoineryImpl('Major_Joinery'),
})

export const Major_Joinery2 = defineMajorCard({
  meta: {
  id: 'Major_Joinery2',
  name: 'Joinery',
  deck: 'major',
  number: 16,
  cost: { wood: 2, stone: 3 },
  vp: 2,
  extraVp: true,
  joineryIdentity: true,
  waresSalesmanGains: [{ wood: 1, reed: 1 }],
  desc: [
    '[Harvest]',
    '<WOOD> <ARROW-1X> 2<FOOD>',
    '[Scoring]',
    '3/5/7<WOOD> <ARROW-1X> 1/2/3<SCORE>',
  ],
},
  impl: buildJoineryImpl('Major_Joinery2'),
})
