import type { CardCostCandidate, PaymentResourceKey, PaymentResourceMap } from '../contract/types'
import type { CardListenerRegistration } from '../cards/card-listeners'
import type { CardRegistry } from '../cards/registry'
import { isMajorCardId } from '../cards/helpers/card-type'
import { isThroughTheSeasonsSeason } from './rules'

const autumnSource = 'through-the-seasons:autumn'
const buildingResources = ['wood', 'clay', 'reed', 'stone'] as const

const discountOneBuildingResource = (
  candidate: CardCostCandidate,
  resource: typeof buildingResources[number],
): CardCostCandidate | null => {
  const key = resource as PaymentResourceKey
  const amount = candidate.resources[key] ?? 0
  if (amount <= 0) return null
  const resources: PaymentResourceMap = { ...candidate.resources }
  if (amount === 1) {
    delete resources[key]
  } else {
    resources[key] = amount - 1
  }
  return {
    ...candidate,
    resources,
    sources: candidate.sources.includes(autumnSource)
      ? [...candidate.sources]
      : [...candidate.sources, autumnSource],
  }
}

const autumnMajorImprovementDiscountListener: CardListenerRegistration = {
  id: 'through-the-seasons:autumn-major-improvement-discount',
  phases: ['computeCosts'],
  actions: ['improvement'],
  cardCostCandidateMandatory: true,
  deriveCardCostCandidate: (context, candidate) => {
    if (!isThroughTheSeasonsSeason(context.state, 'autumn')) return null
    if (!context.cardId || !isMajorCardId(context.cardId)) return null
    const derived = buildingResources.flatMap((resource) => {
      const candidateWithDiscount = discountOneBuildingResource(candidate, resource)
      return candidateWithDiscount ? [candidateWithDiscount] : []
    })
    return derived.length > 0 ? derived : null
  },
}

export const registerThroughTheSeasonsCardListeners = (registry: CardRegistry): void => {
  registry.registerListener(autumnMajorImprovementDiscountListener)
}
