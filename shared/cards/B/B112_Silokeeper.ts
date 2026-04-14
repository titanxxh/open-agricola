import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B112_Silokeeper'

// Maps current round to the round in which the trigger space was revealed.
// -1 means no trigger. This is the space revealed just before the most recent harvest.
// Harvests: 4, 7, 9, 11, 13, 14. Trigger round = round before last harvest.
const TRIGGER_ROUND_MAP: Record<number, number> = {
  1: -1, 2: -1, 3: -1, 4: -1,
  5: 4, 6: 4, 7: 4,
  8: 7, 9: 7,
  10: 9, 11: 9,
  12: 11, 13: 11,
  14: 13,
}

const listener: CardListenerRegistration = {
  id: 'B112-silokeeper-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    const currentRound = context.state.round
    const triggerRevealRound = TRIGGER_ROUND_MAP[currentRound] ?? -1
    if (triggerRevealRound < 0) return
    // Find the space that was revealed in the trigger round
    const triggerSpaceId = context.state.roundActionOrder[triggerRevealRound - 1]
    if (!triggerSpaceId) return
    if (context.space?.id !== triggerSpaceId) return
    return { flow: gainLeaf(CARD_ID, { grain: 1 }), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const B112_Silokeeper = new Occupation({
  id: CARD_ID,
  name: 'Silokeeper',
  deck: 'B',
  number: 112,
  category: 'CROP_PROVIDER',
  desc: ['Each time you use the action space card that has been revealed right before the most recent harvest, you also get 1 <GRAIN>.'],
  cost: {},
  players: '1+',
  newSet: true,
})
