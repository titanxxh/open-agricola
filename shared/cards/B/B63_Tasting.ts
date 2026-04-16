import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainFlow } from '../helpers/pay-gain-node'

const CARD_ID = 'B63_Tasting'

const LESSONS_SPACES = new Set(['lessons', 'lessons-2', 'lessons-4'])

/**
 * B63 Tasting — Each time you use a Lessons action space, before paying the
 * occupation cost, you can exchange 1 GRAIN for 4 FOOD.
 *
 * BGA (B63_Tasting.php): isActionCardEvent($event, 'Lessons') → onPlayerPlaceFarmer
 * returns payGainNode([GRAIN => 1], [FOOD => 4]).
 *
 * We trigger on the 'before' phase of place-farmer on a Lessons space so the
 * exchange resolves before the occupation cost is paid.
 */
// The "before" phase dispatches with actionId = <spaceId>, so we match by
// space ids directly.
const listener: CardListenerRegistration = {
  id: 'B63-tasting-before-lessons',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: Array.from(LESSONS_SPACES),
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    if (!context.space || !LESSONS_SPACES.has(context.space.id)) return
    if ((context.player.resources.grain ?? 0) < 1) return
    return {
      flow: payGainFlow({
        cardId: CARD_ID,
        cost: { grain: 1 },
        gain: { food: 4 },
      }),
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const B63_Tasting = new MinorImprovement({
  id: CARD_ID,
  name: 'Tasting',
  deck: 'B',
  number: 63,
  category: 'FOOD_PROVIDER',
  desc: [
    'Each time you use a __Lessons__ action space, before paying the occupation cost, you can exchange 1 <GRAIN> for 4 <FOOD>.',
  ],
  cost: { wood: 2 },
  vp: 1,
  newSet: true,
})
