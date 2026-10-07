import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import {
  actionSpaceTokenChoiceFlow,
  actionSpaceTokenChoiceRequest,
  consumeActionSpaceToken,
  resolveActionSpaceTokenChoice,
} from '../helpers/action-space-tokens'
import { buildStableFarmInteraction } from '../../domain/farmyard-interaction'
import { getAvailableStableSupplyCount } from '../../domain/supply-tokens'
import type { CardImpl } from '../registry'
import type { GameState, PlayerState } from '../../contract/types'
import { getReservedActionSpaces } from '../helpers/card-state'

const CARD_ID = 'E148_Lazybones'
const TRIGGER_SPACES = ['grain-seeds', 'farmland', 'day-laborer', 'farm-expansion']
const CHOICE_PREFIX = 'lazybones:'

const choiceConfig = (state: GameState, player: PlayerState) => ({
  cardId: CARD_ID,
  spaces: TRIGGER_SPACES,
  max: getAvailableStableSupplyCount(state, player),
  choicePrefix: CHOICE_PREFIX,
  promptKey: 'cards.E148_Lazybones.name',
})

const listener: CardListenerRegistration = {
  id: 'E148-lazybones-opponent-trigger',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (!spaceId || !TRIGGER_SPACES.includes(spaceId)) return

    const ownerPlayer = context.ownerPlayer ?? context.state.players.find(
      (p) => p.id !== context.player.id && p.occupationPlayed.includes(CARD_ID),
    )
    if (!ownerPlayer) return

    const stableSelection = buildStableFarmInteraction(ownerPlayer, undefined, {
      max: 1,
      exactCost: { max: 1 },
    })
    const reward = stableSelection.farmType === 'stable' && stableSelection.maxSelections > 0
      ? {
          type: 'leaf' as const,
          actionId: 'stables',
          sourceCard: CARD_ID,
          targetPlayerId: ownerPlayer.id,
          actionContext: { max: 1, exactCost: { max: 1 } },
        }
      : undefined
    return consumeActionSpaceToken({
      cardId: CARD_ID,
      owner: ownerPlayer,
      ownerPlayerId: ownerPlayer.id,
      spaceId,
      reward,
    })
  },
}

const cardImpl = {
  listeners: [listener],
  effect: {
    id: CARD_ID,
    getRuleContributions: (player) => ({ reservedSupply: { stable: getReservedActionSpaces(player, CARD_ID).length } }),
    projectInteractionRequest: (state, player, request, actionId) => {
      if (actionId !== 'emit-choice' || request.kind !== 'choice') return request
      return { ...request, ...actionSpaceTokenChoiceRequest(choiceConfig(state, player)) }
    },
    onBuy: (state, player) => actionSpaceTokenChoiceFlow(choiceConfig(state, player)),
    resolveChoice: (state, player, choice) => {
      resolveActionSpaceTokenChoice(player, choice, choiceConfig(state, player))
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E148_Lazybones = defineOccupationCard({
  presentation: { reservedActionSpaces: true },
  meta: {
    id: CARD_ID,
    name: 'Lazybones',
    deck: 'E',
    number: 148,
    desc: ['Place (up to) 1 <STABLE> each on __Grain Seeds__, __Farmland__, __Day Laborer__, and __Farm Expansion__. Build the <STABLE> at no cost when another player uses that action space.'],
    cost: {},
    players: '4+',
    category: 'FARMYARD_-_PLACE_FOR_ANIMALS',
  },
  impl: cardImpl,
})

export const E148_Lazybones_impl = E148_Lazybones.impl
