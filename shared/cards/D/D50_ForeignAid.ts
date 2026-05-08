import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D50_ForeignAid } from '../../cards-display/D/D50_ForeignAid'

const CARD_ID = D50_ForeignAid.id

/**
 * D50 Foreign Aid (Minor Improvement):
 * Must be played by round 11.
 * On purchase: gain 6 food.
 * Drawback: The card owner cannot use action spaces that are revealed in
 * rounds 12, 13, or 14 (the last 3 round-action spaces).
 *
 * Implementation: computeArgs listener on place-farmer that filters out
 * blocked action spaces from the choice options for the card owner.
 */

/** Returns the set of action space IDs that are revealed in rounds 12-14 */
const getBlockedSpaceIds = (state: { roundActionOrder: (string | null)[] }): Set<string> => {
  const blocked = new Set<string>()
  // roundActionOrder indices 11, 12, 13 correspond to rounds 12, 13, 14
  for (let i = 11; i <= 13; i++) {
    const spaceId = state.roundActionOrder[i]
    if (spaceId) blocked.add(spaceId)
  }
  return blocked
}

const computeArgsListener: CardListenerRegistration = {
  id: 'D50-foreign-aid-compute-args-place-farmer',
  cardIds: [CARD_ID],
  phases: ['computeArgs' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const blocked = getBlockedSpaceIds(context.state)
    if (blocked.size === 0) return
    // Mutate the result options to filter out blocked spaces
    const result = context.result
    if (
      result
      && result.type === 'request'
      && result.request.kind === 'choice'
      && Array.isArray(result.request.options)
    ) {
      result.request.options = result.request.options.filter(
        (opt) => !blocked.has(opt.value),
      )
    }
  },
}

export { getBlockedSpaceIds }

export const D50_ForeignAid_impl = {
  listeners: [computeArgsListener],
  effect: {
  id: CARD_ID,
  onBuy: () => {
    return gainLeaf(CARD_ID, { food: 6 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
