import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { isSpaceOccupied, spaceHasPlayer } from '../../domain/space'
import type { CardImpl } from '../registry'

const CARD_ID = 'D142_PotatoPlanter'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBeforeReturnHome: (state, player) => {
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
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D142_PotatoPlanter = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Potato Planter',
    deck: 'D',
    number: 142,
    category: 'CROP_PROVIDER',
    desc: ['At the end of each work phase in which you occupy the __Clay Pit__ or __Reed Bank__ accumulation space while the respective other is unoccupied, you get 1 <VEGETABLE>.'],
    cost: {},
    players: '3+',
  },
  impl: cardImpl,
})

export const D142_PotatoPlanter_impl = D142_PotatoPlanter.impl
