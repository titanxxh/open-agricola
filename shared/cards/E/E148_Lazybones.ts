import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import {
  actionSpaceTokenChoiceFlow,
  consumeActionSpaceToken,
  ownerSpecialEffect,
  resolveActionSpaceTokenChoice,
} from '../helpers/action-space-tokens'
import { getNextEmptyTileForPlayer } from '../../domain/farm'
import { getAvailableStableSupplyCount } from '../../domain/supply-tokens'
import type { CardImpl } from '../registry'

const CARD_ID = 'E148_Lazybones'
const TRIGGER_SPACES = ['grain-seeds', 'farmland', 'day-laborer', 'farm-expansion']
const CHOICE_PREFIX = 'lazybones:'

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

    const reward = getNextEmptyTileForPlayer(ownerPlayer)
      ? ownerSpecialEffect(CARD_ID, ownerPlayer.id, {
          kind: 'build-stable-on-first-empty-tile',
        })
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
    onBuy: (state, player) => actionSpaceTokenChoiceFlow({
      cardId: CARD_ID,
      spaces: TRIGGER_SPACES,
      max: getAvailableStableSupplyCount(state, player),
      choicePrefix: CHOICE_PREFIX,
      choiceLabelKey: 'cards.E148_Lazybones.choice',
      promptKey: 'cards.E148_Lazybones.name',
    }),
    resolveChoice: (state, player, choice) => {
      resolveActionSpaceTokenChoice(player, choice, {
        cardId: CARD_ID,
        spaces: TRIGGER_SPACES,
        max: getAvailableStableSupplyCount(state, player),
        choicePrefix: CHOICE_PREFIX,
        choiceLabelKey: 'cards.E148_Lazybones.choice',
      })
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E148_Lazybones = defineOccupationCard({
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
