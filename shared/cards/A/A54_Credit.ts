import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A54_Credit } from '../../cards-display/A/A54_Credit'
export { A54_Credit }

const CARD_ID = A54_Credit.id

const harvestRounds = [4, 7, 9, 11, 13, 14]

export const A54_Credit_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => {
    return gainLeaf(CARD_ID, { food: 5 })
  },
  onRoundEnd: (state, player) => {
    if (harvestRounds.includes(state.round)) return
    // Must pay 1 food or take a begging marker
    player.cardStates = player.cardStates ?? {}
    player.cardStates[CARD_ID] = player.cardStates[CARD_ID] ?? {}
    player.cardStates[CARD_ID]!.extraData = {
      ...(player.cardStates[CARD_ID]!.extraData ?? {}),
      debtDue: true,
    }
  },
  onAfterRoundEnd: (state, _player) => {
    if (harvestRounds.includes(state.round)) return
    return {
      type: 'xor',
      children: [
        payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
        gainLeaf(CARD_ID, { begging: 1 }),
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
