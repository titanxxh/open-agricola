import type { ActionDefinition, ActionFlow, GameState } from '../../../contract/types'
import { describeScheduledOffers, writeScheduledOffers, type ScheduledOffer } from './scheduled-offers'

const normalizeOffers = (round: number, offers: readonly ScheduledOffer[]): ScheduledOffer[] =>
  offers.filter((offer) => !offer.consumed && Number.isInteger(offer.dueRound) && offer.dueRound > round && offer.dueRound <= 14)
    .map((offer) => ({ ...offer, ...(offer.cost ? { cost: { ...offer.cost } } : {}) }))

export const scheduleOffersNode = (cardId: string, offers: readonly ScheduledOffer[]): Extract<ActionFlow, { type: 'leaf' }> => ({
  type: 'leaf', actionId: 'schedule-offers', sourceCard: cardId, params: { offers },
})

/** Coalesce alternative executable plans, never repeated effects inside a plan. */
export const chooseScheduledOfferPlans = (state: GameState, cardId: string, plans: readonly ScheduledOffer[][]): ActionFlow | undefined => {
  const identities = new Set<string>()
  const children: ActionFlow[] = []
  for (const plan of plans) {
    const offers = normalizeOffers(state.round, plan)
    const identity = JSON.stringify(offers)
    if (!offers.length || identities.has(identity)) continue
    identities.add(identity)
    children.push(scheduleOffersNode(cardId, offers))
  }
  return children.length ? { type: 'xor', children } : undefined
}

export const scheduleOffersAction: ActionDefinition = {
  id: 'schedule-offers',
  nameKey: 'actions.future-meeples.name',
  descriptionKey: 'actions.future-meeples.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  previewEffect: ({ state, params }) => describeScheduledOffers(normalizeOffers(state.round, (params?.offers ?? []) as ScheduledOffer[])),
  execute: ({ state, player, sourceCard, params }) => {
    if (!sourceCard) return { type: 'fail', errorKey: 'log.cardEffectFail' }
    writeScheduledOffers(player, sourceCard, normalizeOffers(state.round, (params?.offers ?? []) as ScheduledOffer[]))
    return { type: 'ok' }
  },
}
