import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { spaceHasPlayer } from '../../game/space'

const CARD_ID = 'D130_RecreationalCarpenter'

// D130 Recreational Carpenter: At the end of each work phase in which you did not use the
// Meeting Place action space, you can take a Build Rooms action without placing a person.
// BGA: EndWorkPhase → we use onBeforeReturnHome
registerCardEffect({
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
})

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
