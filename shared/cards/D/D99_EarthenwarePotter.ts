import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { initCardState, incCounter } from '../__stubs__/helpers'

const CARD_ID = 'D99_EarthenwarePotter'

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    if (state.round <= 4) {
      const counters = initCardState(player, CARD_ID)
      counters['earlyBuy'] = 1
    }
  },
  onAfterHarvest: (state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    const counters = initCardState(player, CARD_ID)
    if (!counters['earlyBuy']) return
    if (state.round < 14) return
    const clayAvailable = player.resources.clay
    const familySize = player.familySize
    const count = Math.min(clayAvailable, familySize)
    if (count <= 0) return
    player.resources.clay -= count
    incCounter(player, CARD_ID, 'bonusVp', count)
    incCounter(player, CARD_ID, 'triggerCount')
  },
})

export const D99_EarthenwarePotter = new Occupation({
  id: CARD_ID,
  name: "Earthenware Potter",
  deck: "D",
  number: 99,
  category: "POINTS_PROVIDER",
  desc: ["If you played this card in round 4 or earlier, after the final harvest you can pay 1 <CLAY> per family member to get 1 bonus <SCORE> each."],
  cost: {},
  players: "1+",
})
