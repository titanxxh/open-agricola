import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { jumpLeaf, isJumpChainContains } from '../helpers/jump-leaf'
import { computeAllowedPlacementSpaces } from '../../actions/helpers/placement-availability'
import type { CardImpl } from '../registry'

const CARD_ID = 'A129_Swagman'
const TRIGGER_PAIRS: Record<string, string> = {
  'farm-expansion': 'grain-seeds',
  'grain-seeds': 'farm-expansion',
}

const listener: CardListenerRegistration = {
  id: 'A129-swagman-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isJumpChainContains(context, CARD_ID)) return

    const fromSpaceId = context.space?.id
    if (!fromSpaceId) return
    const targetSpaceId = TRIGGER_PAIRS[fromSpaceId]
    if (!targetSpaceId) return

    const allowed = computeAllowedPlacementSpaces(context.state, context.player)
    if (!allowed.some(a => a.spaceId === targetSpaceId)) return

    const myRef = context.space?.takenBy.find(t => t.playerId === context.player.id)
    if (!myRef) return

    return {
      flow: {
        type: 'seq',
        optional: true,
        choiceLabelKey: 'cards.A129_Swagman.choice',
        children: [
          jumpLeaf({
            sourceCard: CARD_ID,
            workerId: myRef.workerId,
            targetSpaceId,
          }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A129_Swagman = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Swagman',
    deck: 'A',
    number: 129,
    category: 'ACTIONS_BOOSTER',
    desc: [
        'Immediately after each time you use the __Farm Expansion__ or __Grain Seeds__ action space, you can use the respective other space with the same person (even if it is occupied).',
      ],
    cost: {},
    players: '3+',
  },
  impl: cardImpl,
})

export const A129_Swagman_impl = A129_Swagman.impl
