import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainFlow } from '../helpers/pay-gain-node'
import { LESSONS_SPACE_IDS, isLessonsSpaceId } from '../helpers/lessons-spaces'
import type { CardImpl } from '../registry'

const CARD_ID = 'B063_Tasting'
/**
 * B63 Tasting — Each time you use a Lessons action space, before paying the
 * occupation cost, you can exchange 1 GRAIN for 4 FOOD.
 *
 * BGA (B063_Tasting.php): isActionCardEvent($event, 'Lessons') → onPlayerPlaceFarmer
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
  actions: Array.from(LESSONS_SPACE_IDS),
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isLessonsSpaceId(context.space?.id)) return
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

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B063_Tasting = defineMinorCard({
  meta: {
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
  },
  impl: cardImpl,
})

export const B063_Tasting_impl = B063_Tasting.impl
