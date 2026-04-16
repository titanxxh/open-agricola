import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'A124_Knapper'

// A124 Knapper: Each time before you use an action-space card on round
// spaces 5 to 7, you get 1 STONE.
// In our system, `takeAction(player, spaceId)` fires a `before` listener with
// actionId = spaceId. We match any action and filter by round in handler.
// roundActionOrder[round-1] holds the spaceId revealed in each round; indices
// 4, 5, 6 correspond to rounds 5, 6, 7.
const isRound5to7ActionSpace = (context: CardListenerContext): boolean => {
  if (!context.space) return false
  const roundOrder = context.state.roundActionOrder
  for (let i = 4; i <= 6; i += 1) {
    const spaceId = roundOrder[i]
    if (spaceId && spaceId === context.space.id) {
      return true
    }
  }
  return false
}

const listener: CardListenerRegistration = {
  id: 'A124-knapper-before-action',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (!context.space) return
    // Fire only for the top-level space action (actionId === spaceId), not
    // sub-actions (e.g., 'collect') triggered inside the space's flow.
    if (context.actionId !== context.space.id) return
    if (!isRound5to7ActionSpace(context)) return
    return { flow: gainLeaf(CARD_ID, { stone: 1 }), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const A124_Knapper = new Occupation({
  id: CARD_ID,
  name: 'Knapper',
  deck: 'A',
  number: 124,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Each time before you use an action space card on round spaces 5 to 7, you get 1 <STONE>.',
  ],
  cost: {},
  players: '1+',
  newSet: true,
})
