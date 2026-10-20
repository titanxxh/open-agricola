import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookResult } from '../../actions/hooks'
import type { ActionFlow, GameState } from '../../contract/types'
import { workersAvailable } from '../../domain/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'C130_OutskirtsDirector'
const VARIANTS: Record<'grove' | 'hollow', string[]> = {
  grove: ['grove-56'],
  hollow: ['hollow-4', 'hollow-56'],
}
/** The base space and the larger-player-count variants present on this board. */
const pairedSpaceIds = (state: GameState, baseId: 'grove' | 'hollow'): string[] =>
  [baseId, ...VARIANTS[baseId].filter((id) => state.actionSpaces.some((space) => space.id === id))]
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
  phases: ['after'],
  actionSpaces: 'all',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (!spaceId) return

    const groveIds = pairedSpaceIds(context.state, 'grove')
    const hollowIds = pairedSpaceIds(context.state, 'hollow')

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
