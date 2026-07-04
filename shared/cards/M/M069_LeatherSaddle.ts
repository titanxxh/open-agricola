import { defineMinorCard } from '../card-source'
import type { ActionFlow, Resource } from '../../contract/types'
import type { ActionHookPhase } from '../../actions/hooks'
import type { CardListenerRegistration } from '../card-listeners'
import type { CardImpl } from '../registry'

const CARD_ID = 'M069_LeatherSaddle'

const bonusFlow = (count: number): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: CARD_ID,
  params: {
    kind: 'increment-counter',
    key: 'bonusVp',
    amount: count,
  },
})

const readPreResources = (value: unknown): Partial<Resource> | undefined =>
  value && typeof value === 'object' ? value as Partial<Resource> : undefined

const tradeAppliedListener: CardListenerRegistration = {
  id: 'M069-leather-saddle-trade-applied',
  cardIds: [CARD_ID],
  actions: ['trade-applied'],
  phases: ['immediatelyAfter' as ActionHookPhase],
  handler: (context) => {
    const preResources = readPreResources(context.extraData?.preResources)
    if ((preResources?.horse ?? context.player.resources.horse ?? 0) < 3) return
    const cattle = context.eventQuery.filter('resource.exchanged', (event) =>
      (event.gained.food ?? 0) > 0,
    ).reduce((sum, event) => sum + (event.paid.cattle ?? 0), 0)
    if (cattle <= 0) return
    return {
      flow: bonusFlow(cattle),
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [tradeAppliedListener],
  prerequisiteCheck: (player) => (player.resources.horse ?? 0) >= 2,
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M069_LeatherSaddle = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Leather Saddle",
    deck: "M",
    number: 69,
    category: "POINTS_PROVIDER",
    desc: [
        "Each time you have at least 3 <HORSE>, you get 1 bonus <SCORE> for each <CATTLE> that you turn into <FOOD>."
    ],
    cost: {
        "vegetable": 1
    },
    vp: 1,
    extraVp: true,
    prerequisite: "2 Horses",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M069_LeatherSaddle_impl = M069_LeatherSaddle.impl
