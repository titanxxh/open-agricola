import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { rollAndCacheCardPick } from '../helpers/card-random'
import { moorStartCardIds } from '../../moor/start-cards'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'M102_SavingsDeposit'

const startCardNumber = (id: string) =>
  Number(id.replace('moor-start-', ''))

const passLeftLeaf = (): ActionFlow => ({
  type: 'leaf',
  actionId: 'pass-minor-card-to-left',
  sourceCard: CARD_ID,
  params: { cardId: CARD_ID },
})

const cardImpl = {
  effect: {
    id: CARD_ID,
    onStartHarvest: (state, player) => {
      const pick = rollAndCacheCardPick(state, player, CARD_ID, `harvest-${state.round}`, moorStartCardIds)
      state.pendingUndoBoundary = true
      const children: ActionFlow[] = []
      if (startCardNumber(pick) <= (player.resources.clay ?? 0)) {
        children.push(gainLeaf(CARD_ID, { food: 6 }))
      }
      children.push(passLeftLeaf())
      return children.length === 1 ? children[0] : { type: 'seq', children }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M102_SavingsDeposit = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Savings Deposit",
    deck: "M",
    number: 102,
    category: "FOOD_PROVIDER",
    desc: [
        "At the start of each harvest, shuffle all start cards and draw one. If its number is equal to or lower than the amount of clay you have, you immediately get 6 food. Then pass this card to the player on your left, who adds it to their hand."
    ],
    cost: {
        "vegetable": 2
    },
    vp: 1,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M102_SavingsDeposit_impl = M102_SavingsDeposit.impl
