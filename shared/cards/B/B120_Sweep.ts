import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B120_Sweep'

/**
 * B120 Sweep — Each time before you use the action space above the most recent
 * round 1-14 action space, you get 2 CLAY.
 *
 * BGA (B120_Sweep.php): Listens to all action-card PlaceFarmer events, then
 * compares the played actionCardId to ActionCard::getAboveSpaceForRound($turn).
 * Triggers on the 'before' phase so the clay can make the space affordable.
 *
 * BGA mapping of round -> above-space:
 *   5 -> turn-2's round card
 *   6 -> turn-3
 *   7 -> turn-4
 *   8 -> turn-5
 *   9 -> turn-6
 *  10 -> turn-8
 *  11 -> turn-9
 *  12 -> 'day-laborer'
 *  13 -> 'fishing'
 *  14 -> turn-11
 * (rounds 1-4 return null.)
 */
const ABOVE_TURN_BY_ROUND: Record<number, number> = {
  5: 2,
  6: 3,
  7: 4,
  8: 5,
  9: 6,
  10: 8,
  11: 9,
  14: 11,
}
const ABOVE_FIXED_BY_ROUND: Record<number, string> = {
  12: 'day-laborer',
  13: 'fishing',
}

const getAboveSpaceId = (
  round: number,
  roundActionOrder: (string | null)[],
): string | null => {
  if (ABOVE_FIXED_BY_ROUND[round]) return ABOVE_FIXED_BY_ROUND[round]!
  const turn = ABOVE_TURN_BY_ROUND[round]
  if (!turn) return null
  return roundActionOrder[turn - 1] ?? null
}

// The session-level "before" phase dispatches with actionId = <spaceId>.
// The engine also dispatches per-node "before" phases with inner actionIds
// ('gain', 'collect', ...). To fire only at the space-level entry, we compare
// actionId to the space's id.
const listener: CardListenerRegistration = {
  id: 'B120-sweep-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (!context.space) return
    if (context.actionId !== context.space.id) return
    const round = context.state.round
    const aboveId = getAboveSpaceId(round, context.state.roundActionOrder ?? [])
    if (!aboveId) return
    if (context.space.id !== aboveId) return
    return { flow: gainLeaf(CARD_ID, { clay: 2 }), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const B120_Sweep = new Occupation({
  id: CARD_ID,
  name: 'Sweep',
  deck: 'B',
  number: 120,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Each time before you use the action space above the most recent round 1-14 action space, you get 2 <CLAY>.',
  ],
  cost: {},
  players: '1+',
  newSet: true,
})
