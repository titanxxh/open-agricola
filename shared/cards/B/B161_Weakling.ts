import { Occupation } from '../types'
import type { ActionSpace, Resource } from '../../game/types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B161_Weakling'

/**
 * B161 Weakling — Each time it is your turn in the work phase, if there are
 * one or more accumulation spaces with 5+ goods on them and you do not use
 * any of them, you get 1 VEGETABLE.
 *
 * BGA (B161_Weakling.php): isActionCardTurnEvent (any round/placement event) →
 * onPlayerPlaceFarmer scans ActionCards::getAccumulationSpaces() and:
 *   - returns nothing if the played space is one with 5+ goods,
 *   - returns gainNode([VEGETABLE => 1]) if any other accumulation space has 5+ goods.
 *
 * We approximate by scanning state.actionSpaces for spaces with non-empty
 * gainPerRound (i.e. accumulating spaces) and totalling their resources.
 */
const isAccumulationSpace = (space: ActionSpace): boolean => {
  const gpr = space.gainPerRound ?? {}
  return Object.values(gpr).some((v) => (v ?? 0) > 0)
}

const totalResources = (res?: Partial<Resource>): number => {
  if (!res) return 0
  return Object.values(res).reduce<number>((sum, v) => sum + (v ?? 0), 0)
}

const listener: CardListenerRegistration = {
  id: 'B161-weakling-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    const usedSpaceId = context.space?.id
    const accumulationSpaces = (context.state.actionSpaces ?? []).filter(
      isAccumulationSpace,
    )
    let hasFiveOrMore = false
    for (const space of accumulationSpaces) {
      if (totalResources(space.resources) >= 5) {
        hasFiveOrMore = true
        if (space.id === usedSpaceId) {
          // Player used one of the 5+ spaces -> no bonus
          return
        }
      }
    }
    if (!hasFiveOrMore) return
    return { flow: gainLeaf(CARD_ID, { vegetable: 1 }), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const B161_Weakling = new Occupation({
  id: CARD_ID,
  name: 'Weakling',
  deck: 'B',
  number: 161,
  category: 'CROP_PROVIDER',
  desc: [
    'Each time it is your turn in the work phase, if there are one or more accumulation spaces with 5+ goods on them and you do not use any of them, you get 1 <VEGETABLE>.',
  ],
  cost: {},
  players: '4+',
  evenMoreSet: true,
})
