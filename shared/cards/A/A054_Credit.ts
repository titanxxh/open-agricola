import { defineMinorCard } from '../card-source'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A054_Credit'
const harvestRounds = [4, 7, 9, 11, 13, 14]

const cardImpl = {
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

export const A054_Credit = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Credit',
    deck: 'A',
    number: 54,
    category: 'FOOD_PROVIDER',
    desc: [
        'When you play this card, you immediately get 5 <FOOD>. At the end of each round that does not end with a harvest, you must pay 1 <FOOD>, or else take a <BEGGING> marker.',
      ],
    prerequisite: 'At Most 3 Occupations',
    occupationPrerequisites: { max: 3 },
  },
  impl: cardImpl,
})

export const A054_Credit_impl = A054_Credit.impl
