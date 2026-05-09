import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../contract/types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E105_Pioneer } from '../../cards-display/E/E105_Pioneer'

const CARD_ID = E105_Pioneer.id

/**
 * E105 Pioneer (Occupation):
 * On purchase: XOR choice of 1 building resource (wood/clay/reed/stone) + 1 food.
 * Each time you use the most recently revealed action space: same XOR choice.
 *
 * "Most recently revealed" = the action space revealed at the start of the current
 * round, i.e., state.roundActionOrder[state.round - 1].
 */

const buildPioneerChoiceFlow = (): ActionFlow => ({
  type: 'xor',
  children: [
    gainLeaf(CARD_ID, { wood: 1, food: 1 }),
    gainLeaf(CARD_ID, { clay: 1, food: 1 }),
    gainLeaf(CARD_ID, { reed: 1, food: 1 }),
    gainLeaf(CARD_ID, { stone: 1, food: 1 }),
  ],
})

/** Get the action space ID most recently revealed this round */
const getMostRecentlyRevealedSpaceId = (state: { round: number; roundActionOrder: (string | null)[] }): string | null => {
  if (state.round < 1 || state.round > 14) return null
  return state.roundActionOrder[state.round - 1] ?? null
}

const afterPlaceFarmerListener: CardListenerRegistration = {
  id: 'E105-pioneer-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const lastRevealedId = getMostRecentlyRevealedSpaceId(context.state)
    if (!lastRevealedId) return
    if (context.space?.id !== lastRevealedId) return
    return {
      flow: buildPioneerChoiceFlow(),
      sourceCard: CARD_ID,
    }
  },
}

export { getMostRecentlyRevealedSpaceId }

export const E105_Pioneer_impl = {
  listeners: [afterPlaceFarmerListener],
  effect: {
  id: CARD_ID,
  onBuy: () => {
    return buildPioneerChoiceFlow()
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
