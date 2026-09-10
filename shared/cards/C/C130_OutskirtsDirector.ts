import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../contract/types'
import { workersAvailable } from '../../domain/player'
import { pairedSpaceIdFor } from '../helpers/space-pairing'
import type { CardImpl } from '../registry'

const CARD_ID = 'C130_OutskirtsDirector'
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

    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          addResourceFlow,
          ...(workersAvailable(context.state, context.player) > 0 ? [{
            type: 'leaf' as const, actionId: 'place-farmer', optional: true, sourceCard: CARD_ID,
          }] : []),
        ],
      } as ActionFlow,
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C130_OutskirtsDirector = defineOccupationCard({
  meta: {
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
  },
  impl: cardImpl,
})

export const C130_OutskirtsDirector_impl = C130_OutskirtsDirector.impl
