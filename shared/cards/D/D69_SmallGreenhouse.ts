import { MinorImprovement } from '../types'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import { writeCardExtraData, readCardExtraData } from '../helpers/card-state'
import { payGainFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D69_SmallGreenhouse'

export const D69_SmallGreenhouse = new MinorImprovement({
  id: CARD_ID,
  name: 'Small Greenhouse',
  deck: 'D',
  number: 69,
  category: 'CROP_PROVIDER',
  desc: ['Add 4 and 7 to the current round and place 1 <VEGETABLE> on each corresponding round space. At the start of these rounds, you can buy the <VEGETABLE> for 1 <FOOD>.'],
  cost: { wood: 2 },
  vp: 1,
  prerequisite: '1 Occupation',
  occupationPrerequisites: { min: 1 },
})

export const D69_SmallGreenhouse_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const offsets = [4, 7]
    const targetRounds = offsets
      .map((offset) => state.round + offset)
      .filter((r) => r <= 14)
    if (targetRounds.length === 0) return
    writeCardExtraData(player, CARD_ID, 'targetRounds', targetRounds)
    const entries = targetRounds.map((round) => ({ round, resources: { vegetable: 1 } }))
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
    return payGainFlow({
      cardId: CARD_ID,
      cost: { food: 1 },
      gain: { vegetable: 1 },
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
