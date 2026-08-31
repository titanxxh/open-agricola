import { defineMajorCard } from '../card-source'
import { createSingleHarvestExchange } from '../helpers/stage-effects'
import { scoreByResourceTiers } from './helpers'
import type { BonusScoringContext } from '../card-effects'
import type { GameState, PlayerState } from '../../contract/types'

const buildJoineryImpl = (cardId: string) => ({
  effect: {
    id: cardId,
    onHarvest: createSingleHarvestExchange('wood', { food: 2 }, { sourceId: cardId }),
    computeBonusScore: (_state: GameState, player: PlayerState, _ctx: BonusScoringContext) =>
      scoreByResourceTiers(player.resources.wood ?? 0, [
        { min: 7, score: 3 },
        { min: 5, max: 6, score: 2 },
        { min: 3, max: 4, score: 1 },
      ]),
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
  impl: buildJoineryImpl('Major_Joinery2'),
})
