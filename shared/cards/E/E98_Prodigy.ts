import type { CardImpl } from '../registry'
import { E98_Prodigy } from '../../cards-display/E/E98_Prodigy'

const CARD_ID = E98_Prodigy.id

export const E98_Prodigy_impl = {
  effect: {
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
},
  reaches: [] as readonly string[],
} satisfies CardImpl
