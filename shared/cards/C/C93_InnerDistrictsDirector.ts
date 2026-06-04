import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../contract/types'
import { workersAvailable } from '../../domain/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'C93_InnerDistrictsDirector'
/**
 * C93 Inner Districts Director:
 * Each time you use Forest or Clay Pit, place 1 STONE from the general supply
 * on the other space. If you do, you can immediately place another person.
 *
 * BGA: After PlaceFarmer on Forest → place 1 stone on Clay Pit (and vice versa),
 * then optionally place another farmer.
 */
const PAIRED_SPACE: Record<string, string> = {
  forest: 'clay-pit',
  'clay-pit': 'forest',
}

const addStoneToSpaceFlow = (spaceId: string): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: CARD_ID,
  params: {
    kind: 'add-resource-to-space',
    spaceId,
    resource: 'stone',
    amount: 1,
  },
})

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

    const addResourceFlow = addStoneToSpaceFlow(otherSpaceId)

    if (workersAvailable(context.state, context.player) <= 0) {
      return {
        flow: {
          type: 'seq',
          optional: true,
          children: [addResourceFlow],
        } as ActionFlow,
        sourceCard: CARD_ID,
      }
    }

    return {
      flow: {
        type: 'seq',
        optional: true,
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

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C93_InnerDistrictsDirector = defineOccupationCard({
  meta: {
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
  },
  impl: cardImpl,
})

export const C93_InnerDistrictsDirector_impl = C93_InnerDistrictsDirector.impl
