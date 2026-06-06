import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardCostCandidate, PaymentResourceKey, PaymentResourceMap } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D95_SiteManager'
const BUILDING_RESOURCES = ['wood', 'clay', 'stone', 'reed'] as const
/**
 * D95 Site Manager (Occupation, 1+ players).
 *
 * BGA (D95_SiteManager.php): When you play this card, immediately build a
 * MAJOR improvement. When paying its cost, you can replace up to 1 building
 * resource of each type with 1 FOOD each.
 *
 * The card-purchase candidate listener appends one sourced replacement
 * candidate for every non-empty subset of building resources present in the
 * current candidate, preserving the original candidate.
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

const computeCostsListener: CardListenerRegistration = {
  id: 'D95-site-manager-compute-costs',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement'],
  computeCardCostCandidates: (context: CardListenerContext, candidates: readonly CardCostCandidate[]) => {
    if (context.actionCardId !== CARD_ID) return [...candidates]
    if (!context.cardId) return [...candidates]
    const derived: CardCostCandidate[] = []
    for (const candidate of candidates) {
      for (let mask = 1; mask < (1 << BUILDING_RESOURCES.length); mask += 1) {
        const resources: PaymentResourceMap = { ...candidate.resources }
        let changed = false
        for (let index = 0; index < BUILDING_RESOURCES.length; index += 1) {
          if ((mask & (1 << index)) === 0) continue
          const key = BUILDING_RESOURCES[index] as PaymentResourceKey
          const amount = resources[key] ?? 0
          if (amount <= 0) continue
          changed = true
          if (amount <= 1) {
            delete resources[key]
          } else {
            resources[key] = amount - 1
          }
          resources.food = (resources.food ?? 0) + 1
        }
        if (!changed) continue
        derived.push({
          resources,
          originalFeeIndex: candidate.originalFeeIndex,
          sources: [...candidate.sources, CARD_ID],
        })
      }
    }
    return [...candidates, ...derived]
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
