import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardCostCandidate, PaymentResourceKey, PaymentResourceMap } from '../../contract/types'
import { getMajorCard } from '../major/index'
import type { CardImpl } from '../registry'

const CARD_ID = 'M093_FarmhandsQuarters'
const BUILDING_RESOURCES = ['wood', 'clay', 'reed', 'stone'] as const

const rightPlayerOf = (context: CardListenerContext) => {
  const owner = context.ownerPlayer
  if (!owner) return undefined
  const index = context.state.players.findIndex((player) => player.id === owner.id)
  if (index < 0 || context.state.players.length === 0) return undefined
  return context.state.players[(index - 1 + context.state.players.length) % context.state.players.length]
}

const majorCostListener: CardListenerRegistration = {
  id: 'M093-farmhands-quarters-major-cost',
  cardIds: [CARD_ID],
  phases: ['computeCosts'],
  actions: ['improvement'],
  deriveCardCostCandidate: (context, candidate: CardCostCandidate) => {
    if (!context.cardId || !getMajorCard(context.cardId)) return null
    const derived: CardCostCandidate[] = []
    for (const key of BUILDING_RESOURCES) {
      const amount = candidate.resources[key] ?? 0
      if (amount <= 0) continue
      const resources: PaymentResourceMap = { ...candidate.resources }
      if (amount <= 1) {
        delete resources[key]
      } else {
        resources[key as PaymentResourceKey] = amount - 1
      }
      resources.fuel = (resources.fuel ?? 0) + 1
      derived.push({
        resources,
        originalFeeIndex: candidate.originalFeeIndex,
        sources: [...candidate.sources, CARD_ID],
      })
    }
    return derived.length > 0 ? derived : null
  },
}

const rightHandListener: CardListenerRegistration = {
  id: 'M093-farmhands-quarters-right-hand',
  cardIds: [CARD_ID],
  phases: ['after'],
  actions: ['improvement', 'pass-minor-card-to-left'],
  scope: 'any',
  mandatory: true,
  handler: (context) => {
    const owner = context.ownerPlayer
    const rightPlayer = rightPlayerOf(context)
    if (!owner || !rightPlayer) return undefined
    if (rightPlayer.id === owner.id) return undefined
    const passed = context.eventQuery.find('card.passed', (event) =>
      event.toPlayerId === owner.id && event.fromPlayerId === rightPlayer.id
    )
    if (!passed) return undefined
    return {
      flow: gainLeaf(CARD_ID, { food: 1 }),
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [majorCostListener, rightHandListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M093_FarmhandsQuarters = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Farmhands' Quarters",
    deck: "M",
    number: 93,
    category: "GOODS_PROVIDER",
    desc: [
        "Each time you build a major improvement, you can replace 1 building resource of your choice with 1 fuel. Each time you get an improvement in your hand from the player to your right, you also get 1 food."
    ],
    cost: {
        "wood": 1,
        "reed": 1
    },
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M093_FarmhandsQuarters_impl = M093_FarmhandsQuarters.impl
