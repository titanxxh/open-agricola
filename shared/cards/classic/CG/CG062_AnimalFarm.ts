import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import type { CardListenerRegistration } from '../../card-listeners'
import type { ActionFlow } from '../../../contract/types'
import { animalKeysForState } from '../../../contract/animals'
import { getAssignedAnimalsByType } from '../../../domain/animals'
import { readCardExtraData } from '../../helpers/card-state'
import { payLeaf } from '../../helpers/pay-gain-node'
import { grantGuestLeaf } from '../../helpers/guest-flow'

const CARD_ID = 'CG062_AnimalFarm'
const USED_ROUND_KEY = 'usedRound'

const exchangeListener: CardListenerRegistration = {
  id: `${CARD_ID}-exchange`,
  cardIds: [CARD_ID],
  actions: ['anytime'],
  phases: ['anytime'],
  handler: ({ state, player }) => {
    if (state.roundPhase !== 'work' || state.players[state.currentPlayerIndex]?.id !== player.id) return
    if (readCardExtraData<number>(player, CARD_ID, USED_ROUND_KEY) === state.round) return
    const payments = animalKeysForState(state)
      .filter((animal) => (player.resources[animal] ?? 0) > 0)
      .map((animal) => payLeaf({ cardId: CARD_ID, cost: { [animal]: 1 } }))
    if (payments.length === 0) return
    const payment: ActionFlow = payments.length === 1 ? payments[0]! : { type: 'xor', children: payments }
    return {
      sourceCard: CARD_ID,
      flow: {
        type: 'seq',
        children: [
          payment,
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-extra-data', key: USED_ROUND_KEY, value: state.round } },
          grantGuestLeaf(CARD_ID),
        ],
      },
    }
  },
}

const cardImpl = {
  prerequisiteCheck: (player, state) => {
    const animals = getAssignedAnimalsByType(player, state)
    return animalKeysForState(state).filter((animal) => (animals[animal] ?? 0) > 0).length >= 2
  },
  listeners: [exchangeListener],
} satisfies CardImpl

export const CG062_AnimalFarm = defineMinorCard({
  meta: {
    id: 'CG062_AnimalFarm',
    name: 'Animal Farm',
    deck: 'CG',
    number: 62,
    desc: [
      'Once per round, you may return 1 of your animals to the supply for a guest token, which you place this round as you would a family member.',
    ],
    cost: {
      wood: 1,
    },
    prerequisite: '2 Animal Types',
    passing: false,
    extraVp: false,
    implemented: true,
  },
  impl: cardImpl,
})
export const CG062_AnimalFarm_impl = CG062_AnimalFarm.impl
