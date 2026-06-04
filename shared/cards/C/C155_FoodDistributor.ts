import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { writeCardExtraData, readCardExtraData } from '../helpers/card-state'
import { isSpaceOccupied } from '../../domain/space'
import type { CardImpl } from '../registry'

const CARD_ID = 'C155_FoodDistributor'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    writeCardExtraData(player, CARD_ID, 'purchaseRound', state.round)
    return gainLeaf(CARD_ID, { grain: 1 })
  },
  onStartReturnHome: (state, player) => {
    // Only fire once, on the same round as purchase
    if (isCardFlagged(player, CARD_ID)) return
    const purchaseRound = readCardExtraData<number>(player, CARD_ID, 'purchaseRound')
    if (purchaseRound !== state.round) {
      // Not the purchase round — flag and skip
      setCardFlag(player, CARD_ID, true)
      return
    }
    // Count occupied round 1-14 action spaces (non-board action spaces that have a farmer)
    const occupiedCount = state.actionSpaces.filter(
      (s) => isSpaceOccupied(s) && (s.roundAvailable ?? 1) >= 1 && (s.roundAvailable ?? 1) <= 14,
    ).length
    // Flag so it doesn't fire again
    setCardFlag(player, CARD_ID, true)
    if (occupiedCount <= 0) return
    return gainLeaf(CARD_ID, { food: occupiedCount })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C155_FoodDistributor = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Food Distributor',
    deck: 'C',
    number: 155,
    category: 'GOODS_PROVIDER',
    desc: [
        'When you play this card, you immediately get 1 <GRAIN> and, at the start of this returning home phase, an amount of <FOOD> equal to the number of occupied Round 1-14 action spaces.',
      ],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const C155_FoodDistributor_impl = C155_FoodDistributor.impl
