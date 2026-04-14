import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'

const CARD_ID = 'C166_CattleWhisperer'

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    const offsets = [5, 8]
    const entries = offsets
      .map((offset) => ({ round: state.round + offset, resources: { cattle: 1 } }))
      .filter((e) => e.round <= 14)
    if (entries.length === 0) return
    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries,
    })
    return futureMeeplesNode()
  },
})

export const C166_CattleWhisperer = new Occupation({
  id: CARD_ID,
  name: "Cattle Whisperer",
  deck: "C",
  number: 166,
  category: "ANIMAL_HANDLER",
  desc: ["Add 5 and 8 to the current round and place 1 <CATTLE> on each corresponding round space. At the start of these rounds, you get the <CATTLE>."],
  players: "4+",
})
