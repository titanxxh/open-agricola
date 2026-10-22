import { definePlayerActionCard } from '../card-source'
import { registerPlayerActionSpace, createPlayerActionSpaces, definePlayerActionSpaceFlow } from '../player-action-space'
import type { CardImpl } from '../registry'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookResult } from '../../actions/hooks'
import { isTravelingPlayersSpaceId } from '../helpers/action-space-categories'
import { hasCollectableResources } from '../../actions/effects/collect'

const CARD_ID = 'C039_StudioBoat'
registerPlayerActionSpace({
  cardId: CARD_ID,
  access: 'all',
  gainPerRound: { food: 1 },
  shouldRegister: (state) => state.players.length < 4,
  createDefinition: () => definePlayerActionSpaceFlow({
    id: CARD_ID,
    nameKey: 'cards.C039_StudioBoat.name',
    descriptionKey: 'cards.C039_StudioBoat.desc',
    canBeExecutedByPlayer: () => true,
    originalActionCondition: context => hasCollectableResources({ ...context, actionContext: undefined }),
    flowFactory: () => ({ type: 'leaf', actionId: 'collect', sourceCard: CARD_ID }),
  }),
})

const travelingPlayersOwnerVp: CardListenerRegistration = {
  id: 'C39-studio-boat-traveling-players-vp',
  cardIds: [CARD_ID],
  actionSpaces: 'all',
  phases: ['before'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== CARD_ID && !isTravelingPlayersSpaceId(context.space?.id)) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'bonus-vp',
        sourceCard: CARD_ID,
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state) => {
      const newSpaces = createPlayerActionSpaces(state)
      for (const space of newSpaces) {
        if (!state.actionSpaces.some((s) => s.id === space.id)) {
          state.actionSpaces.push(space)
        }
      }
    },
  },
  listeners: [travelingPlayersOwnerVp],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C039_StudioBoat = definePlayerActionCard({
  presentation: { counters: ['bonusVp'] },
  meta: {
    id: CARD_ID,
    name: 'Studio Boat',
    deck: 'C',
    number: 39,
    playerActionCardType: 'minor',
    category: 'POINTS_PROVIDER',
    desc: [
        'Each time you use the __Traveling Players__ accumulation space, you also get 1 bonus <SCORE>. In games with 1-3 players, this card is considered __Traveling Players__ (same effect as __Fishing__).',
      ],
    cost: { wood: 1 },
    prerequisite: '1 Occupation',
    occupationPrerequisites: { min: 1 },
    extraVp: true,
  },
  impl: cardImpl,
})

export const C039_StudioBoat_impl = C039_StudioBoat.impl
