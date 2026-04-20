import { Occupation } from '../types'
import { spaceHasPlayer } from '../../game/space'
import type { CardImpl } from '../registry'

const CARD_ID = 'D130_RecreationalCarpenter'

export const D130_RecreationalCarpenter = new Occupation({
  id: CARD_ID,
  name: 'Recreational Carpenter',
  deck: 'D',
  number: 130,
  category: 'ACTIONS_BOOSTER',
  desc: ['At the end of each work phase in which you did not use the __Meeting Place__ action space, you can take a __Build Rooms__ action without placing a person.'],
  cost: {},
  players: '3+',
  newSet: true,
})

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
