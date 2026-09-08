import { defineOccupationCard } from '../card-source'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { hasInactiveWorkerInSupply } from '../../domain/player'

const CARD_ID = 'E125_DelayedWayfarer'

const PLAYED_ROUND_KEY = 'playedRound'

const buildingChoiceFlow = (): ActionFlow => ({
  type: 'xor',
  children: [
    gainLeaf(CARD_ID, { wood: 1 }),
    gainLeaf(CARD_ID, { clay: 1 }),
    gainLeaf(CARD_ID, { reed: 1 }),
    gainLeaf(CARD_ID, { stone: 1 }),
  ],
})

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    writeCardExtraData(player, CARD_ID, PLAYED_ROUND_KEY, state.round)
    return buildingChoiceFlow()
  },
  onAllWorkersPlaced: (state, player) => {
    const playedRound = readCardExtraData<number>(player, CARD_ID, PLAYED_ROUND_KEY)
    if (playedRound !== state.round) return
    if (!hasInactiveWorkerInSupply(player)) return
    // Clear flag so card cannot trigger again this round
    writeCardExtraData(player, CARD_ID, PLAYED_ROUND_KEY, -1)
    return {
      type: 'seq',
      optional: true,
      children: [
        {
          type: 'leaf',
          actionId: 'place-farmer',
          sourceCard: CARD_ID,
          actionContext: { trueAction: false, extraPlacement: true, workerSource: { kind: 'supply', disposition: 'return-to-supply' } },
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E125_DelayedWayfarer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Delayed Wayfarer',
    deck: 'E',
    number: 125,
    category: 'BUILDING_RESOURCES_-_ALL',
    desc: [
        'When you play this card, you immediately get 1 building resource of your choice and, once all people have been placed this round, you can place a person from your supply.',
      ],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const E125_DelayedWayfarer_impl = E125_DelayedWayfarer.impl
