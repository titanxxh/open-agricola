import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { sumResourceMovedToPlayer } from '../helpers/event-provenance'
import type { Resource } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D140_Loudmouth'
const BUILDING_RESOURCES: (keyof Resource)[] = ['wood', 'clay', 'stone', 'reed']

const ANIMAL_RESOURCES: (keyof Resource)[] = ['sheep', 'boar', 'cattle']

const listener: CardListenerRegistration = {
  id: 'D140-loudmouth-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const events = context.actionEvents ?? context.transactionEvents
    const playerId = context.player.id
    const buildingTotal = BUILDING_RESOURCES.reduce((sum, r) =>
      sum + sumResourceMovedToPlayer(events, r, playerId, (event) =>
        event.from.kind === 'actionSpace',
      ), 0)
    const animalTotal = ANIMAL_RESOURCES.reduce((sum, r) =>
      sum + sumResourceMovedToPlayer(events, r, playerId, (event) =>
        event.from.kind === 'actionSpace',
      ), 0)
    if (buildingTotal < 4 && animalTotal < 4) return
    return { flow: gainLeaf(CARD_ID, { food: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D140_Loudmouth = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Loudmouth',
    deck: 'D',
    number: 140,
    category: 'FOOD_PROVIDER',
    desc: [
        'Each time you take at least 4 building resources or 4 animals from an accumulation space, you also get 1 <FOOD>.',
      ],
    cost: {},
    players: '3+',
  },
  impl: cardImpl,
})

export const D140_Loudmouth_impl = D140_Loudmouth.impl
