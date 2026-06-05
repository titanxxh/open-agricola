import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { PaymentResourceMap } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D95_SiteManager'
/**
 * D95 Site Manager (Occupation, 1+ players).
 *
 * BGA (D95_SiteManager.php): When you play this card, immediately build a
 * MAJOR improvement. When paying its cost, you can replace up to 1 building
 * resource of each type with 1 FOOD each.
 *
 * Candidate deriver mirrors BGA's appended replacement trades.
 */
const onBuyListener: CardListenerRegistration = {
  id: 'D95-site-manager-onbuy',
  cardIds: [CARD_ID],
  actions: ['occupation'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.choice !== CARD_ID) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'improvement',
        optional: true,
        sourceCard: CARD_ID,
        actionContext: { trueAction: false },
        params: {
          types: ['major'],
        },
      },
      sourceCard: CARD_ID,
    }
  },
}

const BUILDING_RESOURCES = ['wood', 'clay', 'stone', 'reed'] as const

const deriveFoodReplacements = (cost: PaymentResourceMap): PaymentResourceMap[] => {
  const result: PaymentResourceMap[] = []
  const seen = new Set<string>()
  for (let mask = 1; mask < (1 << BUILDING_RESOURCES.length); mask++) {
    const next: PaymentResourceMap = { ...cost }
    let changed = false
    for (let index = 0; index < BUILDING_RESOURCES.length; index++) {
      if ((mask & (1 << index)) === 0) continue
      const resource = BUILDING_RESOURCES[index]!
      const amount = next[resource] ?? 0
      if (amount <= 0) continue
      changed = true
      const reduced = amount - 1
      if (reduced > 0) {
        next[resource] = reduced
      } else {
        delete next[resource]
      }
      next.food = (next.food ?? 0) + 1
    }
    if (!changed) continue
    const key = JSON.stringify(Object.entries(next).sort(([left], [right]) => left.localeCompare(right)))
    if (seen.has(key)) continue
    seen.add(key)
    result.push(next)
  }
  return result
}

const computeCostsListener: CardListenerRegistration = {
  id: 'D95-site-manager-compute-costs',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.actionCardId !== CARD_ID) return
    if (!context.cardId) return
    return {
      candidateDerivers: [{
        id: `${CARD_ID}:building-resource-food-replacements`,
        sourceCardId: CARD_ID,
        derive: (candidate) => deriveFoodReplacements(candidate.cost).map((cost) => ({ cost })),
      }],
    }
  },
}

const cardImpl = {
  listeners: [onBuyListener, computeCostsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D95_SiteManager = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Site Manager',
    deck: 'D',
    number: 95,
    category: 'ACTIONS_BOOSTER',
    desc: [
        'When you play this card, immediately build a major improvement. When paying its cost, you can replace up to 1 building resource of each type with 1 <FOOD> each.',
      ],
    cost: {},
    players: '1+',
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const D95_SiteManager_impl = D95_SiteManager.impl
