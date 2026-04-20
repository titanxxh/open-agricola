import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../game/types'
import { workersAvailable } from '../../game/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'C130_OutskirtsDirector'

/**
 * C130 Outskirts Director:
 * Each time you use Grove or Hollow, place 2 REED from the general supply
 * on the other space. If you do, you can immediately place another person.
 *
 * BGA: After PlaceFarmer on Grove → place 2 reed on Hollow (and vice versa).
 * For 4+ players, ActionHollow maps to 'hollow-4' in our system.
 *
 * Implementation note: The reed placement on the other space is applied as an
 * immediate side effect. The "place another person" is optional.
 */

/** Map from triggering space to the "other" space where reed gets placed. */
const PAIRED_SPACE: Record<string, string[]> = {
  grove: ['hollow-4'],
  'hollow-4': ['grove'],
}

const listener: CardListenerRegistration = {
  id: 'C130-outskirts-director-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (!spaceId || !PAIRED_SPACE[spaceId]) return

    const otherSpaceIds = PAIRED_SPACE[spaceId]!
    // Find the first matching other space that exists
    const otherSpace = context.state.actionSpaces.find((s) =>
      otherSpaceIds.includes(s.id),
    )
    if (!otherSpace) return

    // Place 2 reed on the other space (from general supply)
    otherSpace.resources.reed = (otherSpace.resources.reed ?? 0) + 2

    // Offer to place another farmer (requires available workers)
    if (workersAvailable(context.state, context.player) <= 0) return

    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'place-farmer',
            optional: true,
            sourceCard: CARD_ID,
          },
        ],
      } as ActionFlow,
      sourceCard: CARD_ID,
    }
  },
}

export const C130_OutskirtsDirector = new Occupation({
  id: CARD_ID,
  name: 'Outskirts Director',
  deck: 'C',
  number: 130,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'Each time you use the __Grove__ or __Hollow__ accumulation space, you can place 2 <REED> from the general supply on the other space. If you do, you can immediately place another person.',
  ],
  cost: {},
  players: '3+',
  newSet: true,
})

export const C130_OutskirtsDirector_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
