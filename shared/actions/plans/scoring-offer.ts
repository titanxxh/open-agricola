import type { ActionChoiceOption, ActionFlow, Resource } from '../../contract/types'
import { payGainActionFlow } from '../../cards/helpers/pay-gain-node'

export type ScoringOffer = {
  value: string
  resources: Partial<Resource>
  score: number
} & ({ kind: 'pay' } | { kind: 'reserve'; cardType: 'major' | 'minor' | 'occupation' })

export const scoringOfferOption = (cardId: string, offer: ScoringOffer): ActionChoiceOption => {
  const effectPreview = offer.kind === 'pay'
    ? { kind: 'resourceExchange' as const, resourcesPaid: offer.resources, bonusVp: offer.score }
    : { kind: 'scoringReserve' as const, resourcesReserved: offer.resources, bonusVp: offer.score }
  return { value: offer.value, labelKey: 'ui.interactionResourceExchange', sourceCard: cardId,
    effectPreview, descriptionPreview: { kind: 'action', labelKey: 'ui.interactionResourceExchange', showLabel: false, effectPreview } }
}

export const scoringOfferFlow = (cardId: string, offer: ScoringOffer): ActionFlow | undefined => {
  if (offer.score <= 0) return
  if (offer.kind === 'pay') return payGainActionFlow({ cardId, cost: offer.resources, gain: { score: offer.score } })
  return { type: 'leaf', actionId: 'special-effect', sourceCard: cardId,
    params: { kind: 'record-scoring-reserve-bonus', reserved: offer.resources, score: offer.score, cardType: offer.cardType } }
}
