import type { CardImpl } from '../registry'
import { D64_BakingCourse } from '../../cards-display/D/D64_BakingCourse'

const CARD_ID = D64_BakingCourse.id

const harvestRounds = [4, 7, 9, 11, 13, 14]

export const D64_BakingCourse_impl = {
  effect: {
  id: CARD_ID,
  onAfterRoundEnd: (state, player) => {
    if (harvestRounds.includes(state.round)) return
    if (player.resources.grain < 1) return

    return {
      type: 'leaf',
      actionId: 'bake-bread',
      optional: true,
      sourceCard: CARD_ID,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
