import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getStoredResource, setStoredResource } from '../helpers/card-storage'
import type { Resource } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'A144_Sequestrator'
const getOwner = (context: CardListenerContext) =>
  context.state.players.find((player) => player.occupationPlayed.includes(CARD_ID))

const createStorageReleaseListener = (params: {
  id: string
  actionId: string
  resource: keyof Resource
  shouldTrigger: (player: CardListenerContext['player']) => boolean
}): CardListenerRegistration => ({
  id: params.id,
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: [params.actionId],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const owner = getOwner(context)
    if (!owner || !params.shouldTrigger(context.player)) return
    const amount = getStoredResource(owner, CARD_ID, params.resource)
    if (amount <= 0) return
    return {
      flow: {
        type: 'seq',
        children: [
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'set-counter', key: params.resource, value: 0 },
          },
          {
            type: 'leaf',
            actionId: 'gain',
            sourceCard: CARD_ID,
            params: { [params.resource]: amount, recipientPlayerId: context.player.id },
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
})

const fencingListener = createStorageReleaseListener({
  id: 'A144-sequestrator-after-fencing',
  actionId: 'fence',
  resource: 'reed',
  shouldTrigger: (player) => player.pastures.length >= 3,
})

const plowListener = createStorageReleaseListener({
  id: 'A144-sequestrator-after-plow',
  actionId: 'plow',
  resource: 'clay',
  shouldTrigger: (player) => player.fields.length >= 5,
})

const cardImpl = {
  listeners: [fencingListener, plowListener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    setStoredResource(player, CARD_ID, 'reed', 3)
    setStoredResource(player, CARD_ID, 'clay', 4)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A144_Sequestrator = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Sequestrator",
    deck: "A",
    number: 144,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: ["Place 3 <REED> and 4 <CLAY> on this card. The next player to have 3 pastures/5 field tiles gets the 3 <REED>/4 <CLAY> (not retroactively)."],
    cost: {},
    players: "3+",
  },
  impl: cardImpl,
})

export const A144_Sequestrator_impl = A144_Sequestrator.impl
