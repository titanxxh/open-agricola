import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { cardCountsAs } from '../helpers/card-type'
import { storedFoodCashoutListener, storeFoodOnCardFlow } from '../helpers/stored-food-cashout'

const CARD_ID = 'D173_TownClerk'

const builtCardId = (choice: string | undefined): string | undefined => {
  if (!choice) return undefined
  return choice.replace(/^major:/, '').replace(/^minor:/, '')
}

const afterMajorImprovementListener: CardListenerRegistration = {
  id: 'D173-town-clerk-after-major-improvement',
  cardIds: [CARD_ID],
  actions: ['improvement'],
  phases: ['after' as ActionHookPhase],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const owner = context.ownerPlayer
    if (!owner) return
    const cardId = builtCardId(context.choice)
    if (!cardId || !cardCountsAs(cardId, 'major')) return
    const flow = storeFoodOnCardFlow(owner, CARD_ID)
    if (!flow) return
    return { flow, sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [
    afterMajorImprovementListener,
    storedFoodCashoutListener(CARD_ID, 'D173-town-clerk-cashout'),
  ],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D173_TownClerk = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Town Clerk',
    deck: 'D',
    number: 173,
    category: 'FOOD_PROVIDER',
    desc: ['Each time a major improvement is built, place 1 food on this card. Once this game, you can turn this card face down to get the food on it.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const D173_TownClerk_impl = D173_TownClerk.impl
