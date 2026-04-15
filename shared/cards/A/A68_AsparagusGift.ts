import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { writeCardExtraData, readCardExtraData } from '../helpers/card-state'

const CARD_ID = 'A68_AsparagusGift'
const FENCES_BEFORE_KEY = 'fencesBefore'

// A68 Asparagus Gift: Each time you build a number of fences equal to or greater than
// the current round, you immediately get 1 vegetable.
// BGA checks: count($event['fences']) >= Globals::getTurn()

const beforeListener: CardListenerRegistration = {
  id: 'A68-asparagus-gift-before-fencing',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    writeCardExtraData(context.player, CARD_ID, FENCES_BEFORE_KEY, context.player.fences)
  },
}

const afterListener: CardListenerRegistration = {
  id: 'A68-asparagus-gift-after-fencing',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    const fencesBefore = readCardExtraData<number>(context.player, CARD_ID, FENCES_BEFORE_KEY) ?? 0
    const fencesBuilt = context.player.fences - fencesBefore
    if (fencesBuilt < context.state.round) return
    return { flow: gainLeaf(CARD_ID, { vegetable: 1 }), sourceCard: CARD_ID }
  },
}

registerCardListener(beforeListener)
registerCardListener(afterListener)

export const A68_AsparagusGift = new MinorImprovement({
  id: CARD_ID,
  name: 'Asparagus Gift',
  deck: 'A',
  number: 68,
  category: 'CROP_PROVIDER',
  desc: ['Each time you build a number of fences equal to or greater than the current round, you immediately get 1 <VEGETABLE>.'],
  cost: {},
  prerequisite: '1 Unplanted Field',
  newSet: true,
})
