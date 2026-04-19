import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'A54_Credit'

const harvestRounds = [4, 7, 9, 11, 13, 14]

/**
 * A54 Credit:
 * - onBuy: gain 5 food.
 * - onRoundEnd (non-harvest rounds): must pay 1 food or gain 1 begging marker.
 *
 * BGA: onBuy → gain 5 food. EndOfRound on non-harvest rounds → XOR(pay 1 food, gain 1 begging).
 */
registerCardEffect({
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
})

export const A54_Credit = new MinorImprovement({
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
  newSet: true,
})
