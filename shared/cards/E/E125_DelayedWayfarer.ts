import { Occupation } from '../types'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow } from '../../contract/types'
import type { ActionHookPhase } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'E125_DelayedWayfarer'
const PLAYED_ROUND_KEY = 'playedRound'

/**
 * E125 Delayed Wayfarer (Occupation):
 *
 * BGA rule (E125_DelayedWayfarer.php):
 *   When you play this card, you immediately get 1 building resource of your
 *   choice and, once all people have been placed this round, you can place a
 *   person from your supply.
 *
 * Implementation:
 *   - onBuy: Record current round + XOR choice of 1 building resource.
 *   - onAllWorkersPlaced: When all players' workers are placed and it's the
 *     same round this card was played, offer an optional place-farmer with
 *     fromSupply: true. Clears the round flag regardless of player choice.
 *   - isDoable listener: Overrides place-farmer doability when fromSupply is
 *     set and the player has an inactive worker in supply.
 */

const buildingChoiceFlow = (): ActionFlow => ({
  type: 'xor',
  children: [
    gainLeaf(CARD_ID, { wood: 1 }),
    gainLeaf(CARD_ID, { clay: 1 }),
    gainLeaf(CARD_ID, { reed: 1 }),
    gainLeaf(CARD_ID, { stone: 1 }),
  ],
})

export const E125_DelayedWayfarer = new Occupation({
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
})

export const E125_DelayedWayfarer_impl = {
  listeners: [{
  id: 'E125-isDoable-place-farmer-from-supply',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context) => {
    if (!context.actionContext?.fromSupply) return
    const hasSupply = (context.player.workers ?? []).some((w) => !w.isActive)
    if (hasSupply) return { doable: true }
  },
}],
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    writeCardExtraData(player, CARD_ID, PLAYED_ROUND_KEY, state.round)
    return buildingChoiceFlow()
  },
  onAllWorkersPlaced: (state, player) => {
    const playedRound = readCardExtraData<number>(player, CARD_ID, PLAYED_ROUND_KEY)
    if (playedRound !== state.round) return
    if (!(player.workers ?? []).some((w) => !w.isActive)) return
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
          actionContext: { trueAction: false, extraPlacement: true, fromSupply: true },
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
