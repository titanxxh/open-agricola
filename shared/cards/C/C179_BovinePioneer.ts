import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { positionKey } from '../../domain/farm'
import { readCardExtraData } from '../helpers/card-state'

const CARD_ID = 'C179_BovinePioneer'
const PASTURE_TILES_KEY = 'pastureTilesBeforeFencing'

const beforeFence: CardListenerRegistration = {
  id: 'C179-bovine-pioneer-before-fence',
  cardIds: [CARD_ID],
  actions: ['fence'],
  phases: ['before'],
  mandatory: true,
  handler: ({ player }) => ({
    flow: {
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: {
        kind: 'set-extra-data',
        key: PASTURE_TILES_KEY,
        value: player.pastures.flatMap((pasture) => pasture.tiles ?? []).map(positionKey),
      },
    },
    sourceCard: CARD_ID,
  }),
}

const hasNewPasture = (context: CardListenerContext): boolean => {
  const previous = new Set(readCardExtraData<string[]>(context.player, CARD_ID, PASTURE_TILES_KEY) ?? [])
  const built = (context.actionEvents ?? context.transactionEvents).some((event) => event.type === 'farm.fenceBuilt')
  return built && context.player.pastures.some((pasture) =>
    pasture.tiles.some((tile) => !previous.has(positionKey(tile))))
}

const listener: CardListenerRegistration = {
  id: 'C179-bovine-pioneer-after-fence',
  cardIds: [CARD_ID],
  actions: ['fence'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!hasNewPasture(context)) return
    return { flow: gainLeaf(CARD_ID, { cattle: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [beforeFence, listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C179_BovinePioneer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Bovine Pioneer',
    deck: 'C',
    number: 179,
    category: 'LIVESTOCK_PROVIDER',
    desc: ['Each time you create at least one new pasture from unfenced farmyard spaces you get 1 <CATTLE>.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const C179_BovinePioneer_impl = C179_BovinePioneer.impl
