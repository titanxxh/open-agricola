import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../contract/types'
import { payLeaf } from '../helpers/pay-gain-node'
import { jumpLeaf, isJumpChainContains } from '../helpers/jump-leaf'
import { computeAllowedPlacementSpaces } from '../../actions/helpers/placement-availability'
import type { CardImpl } from '../registry'

const CARD_ID = 'B152_JuniorArtist'
const CANDIDATE_TARGETS = ['lessons-4', 'lessons', 'lessons-56-2f', 'lessons-56-variable', 'traveling-players', 'traveling-players-56'] as const

const listener: CardListenerRegistration = {
  id: 'B152-junior-artist-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isJumpChainContains(context, CARD_ID)) return

    if (context.space?.id !== 'day-laborer') return
    if ((context.player.resources.food ?? 0) < 1) return

    const myRef = context.space?.takenBy.find(t => t.playerId === context.player.id)
    if (!myRef) return

    const allowed = computeAllowedPlacementSpaces(context.state, context.player)
    const candidates: ActionFlow[] = CANDIDATE_TARGETS
      .filter(targetSpaceId => allowed.some(a => a.spaceId === targetSpaceId))
      .map(targetSpaceId => jumpLeaf({
        sourceCard: CARD_ID,
        workerId: myRef.workerId,
        targetSpaceId,
      }))

    if (candidates.length === 0) return

    const chained: ActionFlow =
      candidates.length === 1
        ? candidates[0]!
        : { type: 'xor', children: candidates }

    return {
      flow: {
        type: 'seq',
        optional: true,
        choiceLabelKey: 'cards.B152_JuniorArtist.choice',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
          chained,
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

export const B152_JuniorArtist = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Junior Artist',
    deck: 'B',
    number: 152,
    category: 'ACTIONS_BOOSTER',
    desc: [
        'Each time after you use the __Day Laborer__ action space, you can pay 1 <FOOD> to use an unoccupied __Traveling Players__ or __Lessons__ action space with the same person.',
      ],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const B152_JuniorArtist_impl = B152_JuniorArtist.impl
