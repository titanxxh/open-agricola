import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'C28_TeachersDesk'
/**
 * C28 Teacher's Desk (Minor Improvement)
 *
 * "Each time you use the Major Improvement or House Redevelopment action
 * space, you can also play 1 occupation at an occupation cost of 1 food."
 *
 * BGA: isActionCardEvent for MajorImprovement or HouseRedevelopment;
 * onPlayerPlaceFarmer → OCCUPATION action with cost [FOOD => 1].
 *
 * In open-agricola: before place-farmer on major-improvement or
 * house-redevelopment, offer optional occupation with exactCost
 * (food: 1). Same pattern as D28 Writing Desk (which uses 'lessons').
 * Requires at least 1 occupation in hand.
 */

const TRIGGER_SPACES = ['major-improvement', 'house-redevelopment']

const listener: CardListenerRegistration = {
  id: 'C28-teachers-desk-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (!spaceId || !TRIGGER_SPACES.includes(spaceId)) return
    if ((context.player.occupationHand?.length ?? 0) < 1) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'occupation',
        optional: true,
        sourceCard: CARD_ID,
        params: { exactCost: { food: 1 } },
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C28_TeachersDesk = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Teacher's Desk",
    deck: 'C',
    number: 28,
    category: 'ACTIONS_BOOSTER',
    desc: [
        'Each time you use the __Major Improvement__ or __House Redevelopment__ action space, you can also play 1 occupation at an occupation cost of 1 <FOOD>.',
      ],
    cost: { wood: 1 },
    prerequisite: '1 Occupation',
    occupationPrerequisites: { min: 1 },
  },
  impl: cardImpl,
})

export const C28_TeachersDesk_impl = C28_TeachersDesk.impl
