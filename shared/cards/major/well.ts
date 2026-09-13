import { defineMajorCard } from '../card-source'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { GameState, PlayerState } from '../../contract/types'

const buildWellImpl = (cardId: string) => ({
  effect: {
    id: cardId,
    onBuy: (state: GameState, player: PlayerState) =>
      queueFutureMeeplesFlow(state, {
        cardId,
        playerId: player.id,
        startRound: state.round + 1,
        count: 5,
        resources: { food: 1 },
      }),
  },
  reaches: [] as readonly string[],
})

export const Major_Well = defineMajorCard({
  meta: {
  id: 'Major_Well',
  name: 'Well',
  deck: 'major',
  number: 7,
  cost: { wood: 1, stone: 3 },
  vp: 4,
  extraVp: false,
  desc: ['[Put 1 <FOOD> on the 5 next turns. At the start of each turn, collect the <FOOD>]'],
},
  impl: buildWellImpl('Major_Well'),
})

export const Major_Well2 = defineMajorCard({
  meta: {
  id: 'Major_Well2',
  name: 'Well',
  deck: 'major',
  number: 13,
  cost: { clay: 1, stone: 3 },
  vp: 4,
  extraVp: false,
  desc: ['[Put 1 <FOOD> on the 5 next turns. At the start of each turn, collect the <FOOD>]'],
},
  impl: buildWellImpl('Major_Well2'),
})
