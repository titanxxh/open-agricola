import { Occupation } from '../types'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D163_JourneymanBricklayer'

/**
 * D163 Journeyman Bricklayer:
 * When you play this card, you immediately get 2 stone.
 * Each time another player renovates to stone OR builds a stone room,
 * you get 1 stone.
 *
 * "Renovates to stone" means the opponent's houseType is 'stone' after renovation.
 * "Builds stone room" means the opponent constructs while their houseType is 'stone'.
 */
const onBuyListener: CardListenerRegistration = {
  id: 'D163-journeyman-bricklayer-onbuy',
  cardIds: [CARD_ID],
  actions: ['play-occupation'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.choice !== CARD_ID) return
    return { flow: gainLeaf(CARD_ID, { stone: 2 }), sourceCard: CARD_ID }
  },
}

const renovateListener: CardListenerRegistration = {
  id: 'D163-journeyman-bricklayer-opponent-renovate',
  cardIds: [CARD_ID],
  actions: ['renovate-house'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // Trigger only if opponent renovated to stone
    if (context.player.houseType !== 'stone') return
    return { flow: gainLeaf(CARD_ID, { stone: 1 }), sourceCard: CARD_ID }
  },
}

const constructListener: CardListenerRegistration = {
  id: 'D163-journeyman-bricklayer-opponent-construct',
  cardIds: [CARD_ID],
  actions: ['construct'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // Trigger only if opponent built a stone room
    if (context.player.houseType !== 'stone') return
    return { flow: gainLeaf(CARD_ID, { stone: 1 }), sourceCard: CARD_ID }
  },
}

export const D163_JourneymanBricklayer = new Occupation({
  id: CARD_ID,
  name: 'Journeyman Bricklayer',
  deck: 'D',
  number: 163,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'When you play this card, you immediately get 2 <STONE>. Each time another player renovates to stone or builds a stone room, you get 1 <STONE>.',
  ],
  cost: {},
  players: '4+',
})

export const D163_JourneymanBricklayer_impl = {
  listeners: [onBuyListener, renovateListener, constructListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
