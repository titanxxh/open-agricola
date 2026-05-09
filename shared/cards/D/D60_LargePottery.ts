import { returnCardToBoard } from '../helpers/return-card'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import type { CardImpl } from '../registry'
import { D60_LargePottery } from '../../cards-display/D/D60_LargePottery'

const CARD_ID = D60_LargePottery.id

/**
 * D60 Large Pottery — dual-type minor that also counts as a major (BGA
 * `getOtherCardTypes() == [MAJOR]`). Buying it requires that the player has
 * already played Major_Pottery, then returns that Pottery to the common board
 * via a custom prerequisite + onBuy handler (not via `returnCards`, because
 * BGA models "Return the Pottery" as a prerequisite, not an "or" payment).
 * Anytime exchange CLAY → 2 FOOD. Endgame score from reserved CLAY, matching
 * BGA's scoresMap (3-4→1, 5→2, 6→3, 7+→4). `extraVp: true` flags the card as
 * carrying its own scoring rule on top of the printed `vp: 3`.
 */

registerPrerequisite('Return the Pottery', (player) =>
  player.improvements.includes('Major_Pottery'))

export const D60_LargePottery_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    if (!player.improvements.includes('Major_Pottery')) return
    returnCardToBoard(player, 'Major_Pottery', state)
  },
  computeBonusScore: (_state, player) => {
    // Solver has already subtracted any costed-bonus reservations from
    // playerForBonus.resources, so this read is the post-solve remaining clay.
    const clay = player.resources.clay ?? 0
    if (clay >= 7) return 4
    if (clay >= 6) return 3
    if (clay >= 5) return 2
    if (clay >= 3) return 1
    return 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
