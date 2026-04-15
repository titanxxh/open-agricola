import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'D132_HideFarmer'

registerCardEffect({
  id: CARD_ID,
  computePostScore: (_state, player, categories) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return 0
    // Find the 'empty' scoring category (unused farmyard spaces)
    const emptyCat = categories.find(c => c.key === 'empty')
    if (!emptyCat || emptyCat.total >= 0) return 0
    // Each empty space = -1 VP. Pay 1 food per space to offset.
    const penalty = Math.abs(emptyCat.total)
    const canPay = Math.min(penalty, player.resources.food)
    if (canPay <= 0) return 0
    player.resources.food -= canPay
    return canPay // offset penalty
  },
})

export const D132_HideFarmer = new Occupation({
  id: CARD_ID,
  name: "Hide Farmer",
  deck: "D",
  number: 132,
  category: "POINTS_PROVIDER",
  desc: ['During scoring, you can pay 1 <FOOD> each for any number of unused farmyard spaces. You do not lose points for these spaces.'],
  cost: {},
  players: "3+",
})
