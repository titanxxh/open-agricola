import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { setStoredResource, takeStoredResource } from '../helpers/card-storage'
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
    const amount = takeStoredResource(owner, CARD_ID, params.resource)
    if (amount <= 0) return
    const gain = { [params.resource]: amount } as Partial<Resource>
    // Give resources directly to the acting player (who met the threshold),
    // not the card owner — returning a flow would PlayerSwitch to the owner.
    const target = context.player
    target.resources[params.resource] = (target.resources[params.resource] ?? 0) + amount
    return {
      logKey: 'log.cardEffectGain',
      logParams: { gain, cardId: CARD_ID },
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

export const A144_Sequestrator = new Occupation({
  id: CARD_ID,
  name: "Sequestrator",
  deck: "A",
  number: 144,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Place 3 <REED> and 4 <CLAY> on this card. The next player to have 3 pastures/5 field tiles gets the 3 <REED>/4 <CLAY> (not retroactively)."],
  cost: {},
  players: "3+",
  newSet: true,
})

export const A144_Sequestrator_impl = {
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
