import { spaceHasPlayer } from '../../domain/space'
import type { CardImpl } from '../registry'
import { D130_RecreationalCarpenter } from '../../cards-display/D/D130_RecreationalCarpenter'

const CARD_ID = D130_RecreationalCarpenter.id

export const D130_RecreationalCarpenter_impl = {
  effect: {
  id: CARD_ID,
  onBeforeReturnHome: (state, player) => {
    const meetingPlace = state.actionSpaces.find((s) => s.id === 'meeting-place')
    if (meetingPlace && spaceHasPlayer(meetingPlace, player.id)) return
    return {
      type: 'seq',
      optional: true,
      children: [
        { type: 'leaf', actionId: 'construct', sourceCard: CARD_ID },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
