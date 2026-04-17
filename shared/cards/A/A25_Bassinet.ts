import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getRoundPlacementOrder } from '../helpers/round-placement'
import { countPeopleOnSpace } from '../helpers/space-occupancy'
import type { GameState } from '../../game/types'

const CARD_ID = 'A25_Bassinet'
const MEETING_PLACE_ID = 'meeting-place'

/**
 * Derive the first globally-used non-accumulating action space of this work
 * phase (round).  Starting player acts first; players interleave by slot index
 * (slot 0 → all players in turn order, then slot 1, etc.).
 * Newborn workers pushed to takenBy but not recorded via recordRoundPlacement,
 * so they don't pollute this lookup.
 */
function findFirstNonAccumSpaceThisRound(state: GameState): string | null {
  const startIdx = state.players.findIndex((p) => p.startPlayer)
  const N = state.players.length
  if (N === 0 || startIdx < 0) return null
  const turnOrder = Array.from({ length: N }, (_, i) => state.players[(startIdx + i) % N])
  const maxSlots = Math.max(0, ...turnOrder.map((p) => getRoundPlacementOrder(p).length))

  for (let slot = 0; slot < maxSlots; slot++) {
    for (const p of turnOrder) {
      const placements = getRoundPlacementOrder(p)
      if (slot >= placements.length) continue
      const spaceId = placements[slot]
      const space = state.actionSpaces.find((s) => s.id === spaceId)
      if (!space) continue
      if (Object.keys(space.gainPerRound).length > 0) continue // skip accumulating spaces
      return spaceId
    }
  }
  return null
}

/**
 * A25 Bassinet (MinorImprovement, A, #25, VP=1, cost={})
 *
 * BGA desc: You can place a(nother) person on the first non-accumulating
 * action space used in each work phase, if there is only 1 person,
 * including newborns, on that space. (There can never be two people on
 * Meeting Place.)
 *
 * Implementation: canUseOccupied listener.  Only fires when the card owner
 * themselves is placing a farmer and all conditions are met.
 */
const canUseOccupiedListener: CardListenerRegistration = {
  id: 'A25-bassinet-can-use-occupied',
  cardIds: [CARD_ID],
  phases: ['canUseOccupied' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.ownerPlayer) return
    if (!context.ownerPlayer.minorPlayed.includes(CARD_ID)) return
    // Only grant the benefit to the card owner's own placements
    if (context.player.id !== context.ownerPlayer.id) return

    const space = context.space
    if (!space) return
    if (space.id === MEETING_PLACE_ID) return // Meeting Place explicitly excluded

    if (findFirstNonAccumSpaceThisRound(context.state) !== space.id) return
    if (countPeopleOnSpace(context.state, space.id) !== 1) return

    return { canUseOccupied: true }
  },
}

registerCardListener(canUseOccupiedListener)

export const A25_Bassinet = new MinorImprovement({
  id: CARD_ID,
  name: 'Bassinet',
  deck: 'A',
  number: 25,
  category: 'FOOD_PROVIDER',
  desc: [
    'You can place a(nother) person on the first non-accumulating action space used in each work phase, if there is only 1 person, including newborns, on that space. (There can never be two people on __Meeting Place__.)',
  ],
  cost: {},
  vp: 1,
})
