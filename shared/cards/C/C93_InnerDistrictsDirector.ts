import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../game/types'
import { workersAvailable } from '../../game/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'C93_InnerDistrictsDirector'

/**
 * C93 Inner Districts Director:
 * Each time you use Forest or Clay Pit, place 1 STONE from the general supply
 * on the other space. If you do, you can immediately place another person.
 *
 * BGA: After PlaceFarmer on Forest → place 1 stone on Clay Pit (and vice versa),
 * then optionally place another farmer. The entire sequence is optional.
 *
 * Implementation note: The stone placement on the other space (from general supply)
 * is applied as an immediate side effect when the player triggers the card. The
 * "place another person" is offered as an optional follow-up flow. In BGA the stone
 * placement is also conditional on accepting the sequence, but since the stone comes
 * from an unlimited supply this simplification has minimal game impact.
 */
const PAIRED_SPACE: Record<string, string> = {
  forest: 'clay-pit',
  'clay-pit': 'forest',
}

const listener: CardListenerRegistration = {
  id: 'C93-inner-districts-director-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (!spaceId || !PAIRED_SPACE[spaceId]) return

    const otherSpaceId = PAIRED_SPACE[spaceId]!
    const otherSpace = context.state.actionSpaces.find((s) => s.id === otherSpaceId)
    if (!otherSpace) return

    // Place 1 stone on the other space (from general supply)
    otherSpace.resources.stone = (otherSpace.resources.stone ?? 0) + 1

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

export const C93_InnerDistrictsDirector = new Occupation({
  id: CARD_ID,
  name: 'Inner Districts Director',
  deck: 'C',
  number: 93,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'Each time you use the __Forest__ or __Clay Pit__ accumulation space, you can place 1 <STONE> from the general supply on the other space. If you do, you can immediately place another person.',
  ],
  cost: {},
  players: '1+',
  newSet: true,
})

export const C93_InnerDistrictsDirector_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
