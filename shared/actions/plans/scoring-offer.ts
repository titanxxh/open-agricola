import type { ActionChoiceOption, ActionFlow, AnytimeWindow, GameState, PlayerState, Resource } from '../../contract/types'
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

/**
 * An end-game scoring offer choice: the `emit-choice` prompt and the matching
 * `resolveChoice`, both built from the same `offersOf(player)`.
 */
export const scoringOfferChoice = (cardId: string, offersOf: (player: PlayerState) => ScoringOffer[]) => {
  const options = (player: PlayerState) => offersOf(player).map(offer => scoringOfferOption(cardId, offer))
  return {
    options,
    promptLeaf: (player: PlayerState, promptKey: string, extra: { anytimeWindow?: AnytimeWindow } = {}): ActionFlow => ({
      type: 'leaf', actionId: 'emit-choice', sourceCard: cardId, targetPlayerId: player.id,
      actionContext: { targetPlayerId: player.id }, ...extra, params: { promptKey, options: options(player) },
    }),
    resolveChoice: (_state: GameState, player: PlayerState, choice: string): ActionFlow | undefined => {
      const offer = offersOf(player).find(candidate => candidate.value === choice)
      return offer ? scoringOfferFlow(cardId, offer) : undefined
    },
  }
}
