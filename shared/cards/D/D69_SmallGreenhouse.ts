import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { queueFutureMeeplesFlow } from '../../actions/effects/future-meeples'
import { writeCardExtraData, readCardExtraData } from '../helpers/card-state'
import { payGainFlow } from '../helpers/pay-gain-node'

const CARD_ID = 'D69_SmallGreenhouse'

// D69 Small Greenhouse: On buy, place 1 vegetable on round spaces (current + 4) and (current + 7).
// At the start of those rounds, the player can buy the vegetable for 1 food.
//
// Implementation: onBuy stores target rounds in extraData and queues visual future meeples.
// onRoundStart checks if the current round is a target round and offers the pay-to-receive option.

registerCardEffect({
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
})

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
