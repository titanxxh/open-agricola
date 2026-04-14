import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'D28_WritingDesk'

// Each time you use a Lessons action space, you can play 1 additional occupation for 2 food.
// Requires at least 2 occupations in hand (one for main Lessons, one for Writing Desk).
const listener: CardListenerRegistration = {
  id: 'D28-writing-desk-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    const spaceId = context.space?.id
    if (spaceId !== 'lessons' && spaceId !== 'lessons-2') return
    // Need at least 2 occupations in hand (one for main Lessons, one for Writing Desk)
    if ((context.player.occupationHand?.length ?? 0) < 2) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'play-occupation',
        optional: true,
        sourceCard: CARD_ID,
        params: { costOverride: { food: 2 } },
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const D28_WritingDesk = new MinorImprovement({
  id: CARD_ID,
  name: 'Writing Desk',
  deck: 'D',
  number: 28,
  category: 'ACTIONS_BOOSTER',
  desc: ['Each time you use a __Lessons__ action space, you can play 1 additional occupation for an occupation cost of 2 <FOOD>.'],
  cost: { wood: 1 },
  vp: 1,
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
})
