import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getStoredResource } from '../helpers/card-storage'
import type { CardImpl } from '../registry'

const CARD_ID = 'A081_InterimStorage'
const PAYOUT_ROUNDS = new Set([7, 11, 14])

const COLLECT_MAP = {
  clay: 'wood',
  reed: 'clay',
  stone: 'reed',
} as const

const collectListener: CardListenerRegistration = {
  id: 'A81-interim-storage-before-collect',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const storedEntry = Object.entries(COLLECT_MAP).find(
      ([resource]) => (context.space.resources?.[resource as keyof typeof context.space.resources] ?? 0) > 0,
    )
    if (!storedEntry) return
    const [, storedResource] = storedEntry
    return {
      flow: {
        type: 'leaf',
        actionId: 'store-on-card',
        params: { [storedResource]: 1 },
        sourceCard: CARD_ID,
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [collectListener],
  effect: {
  id: CARD_ID,
  onRoundStart: (state, player) => {
    if (!PAYOUT_ROUNDS.has(state.round)) return

    const takeable = (['wood', 'clay', 'reed'] as const)
      .map((resource) => ({
        resource,
        amount: getStoredResource(player, CARD_ID, resource),
      }))
      .filter((entry) => entry.amount > 0)

    if (takeable.length === 0) return

    return {
      type: 'seq',
      children: takeable.map((entry) => ({
        type: 'leaf' as const,
        actionId: 'take-from-card',
        params: { [entry.resource]: entry.amount },
        sourceCard: CARD_ID,
      })),
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A081_InterimStorage = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Interim Storage",
    deck: "A",
    number: 81,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: ["Each time you use a <CLAY>/<REED>/<STONE> accumulation space, place 1 <WOOD>/<CLAY>/<REED> on this card. At the start of rounds 7, 11, and 14, move all the goods on this card to your supply."],
    cost: {"food":2},
  },
  presentation: { counters: ['wood', 'clay', 'reed'] },
  impl: cardImpl,
})

export const A081_InterimStorage_impl = A081_InterimStorage.impl
