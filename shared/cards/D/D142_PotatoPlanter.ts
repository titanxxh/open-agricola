import { gainLeaf } from '../helpers/pay-gain-node'
import { isSpaceOccupied, spaceHasPlayer } from '../../domain/space'
import type { CardImpl } from '../registry'
import { D142_PotatoPlanter } from '../../cards-display/D/D142_PotatoPlanter'
export { D142_PotatoPlanter }

const CARD_ID = D142_PotatoPlanter.id

export const D142_PotatoPlanter_impl = {
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
