import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'E98_Prodigy'

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    // Only triggers when this is the 1st occupation played (including this card)
    if (player.occupationPlayed.length !== 1) return

    // Count all improvements: major + minor improvements
    const improvementCount = player.improvements.length + player.minorPlayed.length
    if (improvementCount <= 0) return

    const bonusVpLeaves = Array.from({ length: improvementCount }, () => ({
      type: 'leaf' as const,
      actionId: 'bonus-vp',
      sourceCard: CARD_ID,
    }))

    return {
      type: 'seq' as const,
      children: bonusVpLeaves,
    }
  },
})

export const E98_Prodigy = new Occupation({
  id: CARD_ID,
  name: 'Prodigy',
  deck: 'E',
  number: 98,
  category: 'POINTS_PROVIDER',
  desc: ['If this is your 1st occupation, you immediately get 1 <SCORE> for each improvement you have. (This will not apply to improvements played after this card.)'],
  players: '1+',
})
