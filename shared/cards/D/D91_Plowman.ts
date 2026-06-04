import { defineOccupationCard } from '../card-source'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import { writeCardExtraData, readCardExtraData } from '../helpers/card-state'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D91_Plowman'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const offsets = [4, 7, 10]
    const targetRounds = offsets
      .map((offset) => state.round + offset)
      .filter((r) => r <= 14)
    if (targetRounds.length === 0) return
    writeCardExtraData(player, CARD_ID, 'targetRounds', targetRounds)
    const entries = targetRounds.map((round) => ({ round, resources: {} }))
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries,
    })
  },
  onRoundStart: (state, player) => {
    const targetRounds = readCardExtraData<number[]>(player, CARD_ID, 'targetRounds') ?? []
    if (!targetRounds.includes(state.round)) return
    if ((player.resources.food ?? 0) < 1) return
    return {
      type: 'seq',
      optional: true,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
        { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D91_Plowman = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Plowman',
    deck: 'D',
    number: 91,
    category: 'FARM_PLANNER',
    desc: ['Add 4, 7, and 10 to the current round and place a field tile on each corresponding round space. At the start of these rounds, you can plow the field for 1 <FOOD>.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const D91_Plowman_impl = D91_Plowman.impl
