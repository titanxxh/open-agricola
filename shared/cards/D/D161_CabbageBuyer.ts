import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import { cardCountsAs } from '../helpers/card-type'
import type { ActionFlow, PlayerState } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D161_CabbageBuyer'
const buildOfferFlow = (owner: PlayerState, cost: number): ActionFlow | undefined => {
  if ((owner.resources.food ?? 0) < cost) return undefined
  return {
    type: 'seq',
    optional: true,
    children: [
      payLeaf({ cardId: CARD_ID, cost: { food: cost } }),
      gainLeaf(CARD_ID, { vegetable: 1 }),
    ],
  }
}

const isNormalRedevelopmentSpace = (spaceId: string) =>
  spaceId === 'house-redevelopment' || spaceId === 'farm-redevelopment'

const redevelopmentListener: CardListenerRegistration = {
  id: 'D161-cabbage-buyer-after-redevelopment',
  cardIds: [CARD_ID],
  actionSpaces: ['house-redevelopment', 'farm-redevelopment'],
  phases: ['after'],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const owner = context.ownerPlayer
    const events = (context.actionEvents ?? []).filter(event => 'schemaVersion' in event)
    const renovation = events.find(event => event.type === 'farm.renovated' && event.playerId === context.player.id)
    if (!owner || !renovation) return
    const improvements = events.flatMap(event => {
      if (event.seq <= renovation.seq) return []
      if (event.type === 'card.played' && event.actorPlayerId === context.player.id && event.cardType !== 'occupation') return [event.cardId]
      if (event.type === 'card.passed' && event.fromPlayerId === context.player.id) return [event.cardId]
      return []
    })
    const cost = improvements.some(cardId => cardCountsAs(cardId, 'major')) ? 1 : improvements.length ? 2 : 3
    const flow = buildOfferFlow(owner, cost)
    if (flow) return { flow, sourceCard: CARD_ID }
  },
}

const standaloneRenovationListener: CardListenerRegistration = {
  id: 'D161-cabbage-buyer-after-standalone-renovation',
  cardIds: [CARD_ID],
  actions: ['renovate-house'],
  phases: ['after' as ActionHookPhase],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const owner = context.ownerPlayer
    if (!owner || isNormalRedevelopmentSpace(context.space.id)) return
    const flow = buildOfferFlow(owner, 3)
    if (flow) return { flow, sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [redevelopmentListener, standaloneRenovationListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D161_CabbageBuyer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Cabbage Buyer',
    deck: 'D',
    number: 161,
    category: 'CROP_PROVIDER',
    desc: [
        'Each time any player (including you) renovates and then builds no/1 minor/1 major improvement, you can buy 1 <VEGETABLE> for 3/2/1 <FOOD>.',
      ],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const D161_CabbageBuyer_impl = D161_CabbageBuyer.impl
