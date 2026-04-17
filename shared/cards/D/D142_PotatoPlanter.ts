import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'
import { isSpaceOccupied, spaceHasPlayer } from '../../game/space'

const CARD_ID = 'D142_PotatoPlanter'

// D142 Potato Planter: At the end of each work phase in which you occupy the Clay Pit or
// Reed Bank accumulation space while the respective other is unoccupied, you get 1 vegetable.
// BGA: EndWorkPhase → we use onBeforeReturnHome
registerCardEffect({
  id: CARD_ID,
  onBeforeReturnHome: (state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    const clayPit = state.actionSpaces.find((s) => s.id === 'clay-pit')
    const reedBank = state.actionSpaces.find((s) => s.id === 'reed-bank')

    const onClayPit = !!clayPit && spaceHasPlayer(clayPit, player.id)
    const onReedBank = !!reedBank && spaceHasPlayer(reedBank, player.id)
    const clayPitOccupied = !!clayPit && isSpaceOccupied(clayPit)
    const reedBankOccupied = !!reedBank && isSpaceOccupied(reedBank)

    if (
      (onClayPit && !reedBankOccupied) ||
      (onReedBank && !clayPitOccupied)
    ) {
      return gainLeaf(CARD_ID, { vegetable: 1 })
    }
  },
})

export const D142_PotatoPlanter = new Occupation({
  id: CARD_ID,
  name: 'Potato Planter',
  deck: 'D',
  number: 142,
  category: 'CROP_PROVIDER',
  desc: ['At the end of each work phase in which you occupy the __Clay Pit__ or __Reed Bank__ accumulation space while the respective other is unoccupied, you get 1 <VEGETABLE>.'],
  cost: {},
  players: '3+',
  newSet: true,
})
