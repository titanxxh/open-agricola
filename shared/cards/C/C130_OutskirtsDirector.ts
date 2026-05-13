import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../contract/types'
import { workersAvailable } from '../../domain/player'
import { pairedSpaceIdFor } from '../helpers/space-pairing'
import type { CardImpl } from '../registry'
import { C130_OutskirtsDirector } from '../../cards-display/C/C130_OutskirtsDirector'

const CARD_ID = C130_OutskirtsDirector.id

/**
 * C130 Outskirts Director:
 * Each time you use Grove or Hollow, place 2 REED from the general supply
 * on the other space. If you do, you can immediately place another person.
 *
 * BGA: After PlaceFarmer on Grove → place 2 reed on Hollow (and vice versa).
 * In 4-player games, the Hollow accumulation space is 'hollow-4' (different
 * gain rate). We use `pairedSpaceIdFor` to resolve the variant.
 *
 * OA behavior: the reed placement is mandatory after the trigger and is not
 * declined together with the optional extra placement.
 */

const addReedToSpaceFlow = (spaceId: string): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: CARD_ID,
  params: {
    kind: 'add-resource-to-space',
    spaceId,
    resource: 'reed',
    amount: 2,
  },
})

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

    const addResourceFlow = addReedToSpaceFlow(otherSpace.id)

    if (workersAvailable(context.state, context.player) <= 0) {
      return {
        flow: addResourceFlow,
        sourceCard: CARD_ID,
      }
    }

    return {
      flow: {
        type: 'seq',
        children: [
          addResourceFlow,
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

export const C130_OutskirtsDirector_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
