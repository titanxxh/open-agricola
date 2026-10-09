import type { ActionDefinition, ActionFlow, GameState } from '../../../contract/types'
import { writeScheduledOffers, type ScheduledOffer } from './scheduled-offers'

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
  previewEffect: ({ state, params }) => ({
    kind: 'futureOffers',
    entries: normalizeOffers(state.round, (params?.offers ?? []) as ScheduledOffer[]).map((offer) => offer.kind === 'animal-purchase'
      ? { round: offer.dueRound, resources: { [offer.animal]: 1 }, resourcesPaid: offer.cost }
      : { round: offer.dueRound, resources: {}, resourcesPaid: offer.cost ?? {}, actionNameKey: `moor.specialActions.${offer.actionId}` }),
  }),
  execute: ({ state, player, sourceCard, params }) => {
    if (!sourceCard) return { type: 'fail', errorKey: 'log.cardEffectFail' }
    writeScheduledOffers(player, sourceCard, normalizeOffers(state.round, (params?.offers ?? []) as ScheduledOffer[]))
    return { type: 'ok' }
  },
}
