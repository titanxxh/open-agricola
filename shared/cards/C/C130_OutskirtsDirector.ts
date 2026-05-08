import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../contract/types'
import { workersAvailable } from '../../game/player'
import { pairedSpaceIdFor } from '../helpers/space-pairing'
import type { CardImpl } from '../registry'

const CARD_ID = 'C130_OutskirtsDirector'

/**
 * C130 Outskirts Director:
 * Each time you use Grove or Hollow, place 2 REED from the general supply
 * on the other space. If you do, you can immediately place another person.
 *
 * BGA: After PlaceFarmer on Grove → place 2 reed on Hollow (and vice versa).
 * In 4-player games, the Hollow accumulation space is 'hollow-4' (different
 * gain rate). We use `pairedSpaceIdFor` to resolve the variant.
 */

const listener: CardListenerRegistration = {
  id: 'C130-outskirts-director-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (!spaceId) return

    const groveIds = pairedSpaceIdFor(context.state, 'grove')
    const hollowIds = pairedSpaceIdFor(context.state, 'hollow')

    let otherSpaceIds: string[]
    if (groveIds.includes(spaceId)) {
      otherSpaceIds = hollowIds
    } else if (hollowIds.includes(spaceId)) {
      otherSpaceIds = groveIds
    } else {
      return
    }

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
