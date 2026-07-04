import { defineMinorCard } from '../card-source'
import type { CardExchange } from '../../contract/cards'
import type { ActionHookPhase } from '../../actions/hooks'
import type { CardListenerRegistration } from '../card-listeners'
import type { CardImpl } from '../registry'
import { playerHasCardCapability } from '../helpers/card-type'

const CARD_ID = 'M107_PotRoastRecipe'

const exchange: CardExchange = {
  from: { horse: 1 },
  to: { food: 2 },
  sourceId: CARD_ID,
  triggers: ['anytime'],
}

const computeExchangesListener: CardListenerRegistration = {
  id: 'M107-pot-roast-recipe-compute-exchanges',
  cardIds: [CARD_ID],
  phases: ['computeExchanges' as ActionHookPhase],
  handler: (context) => {
    const window = (context.extraData as { window?: string } | undefined)?.window
    if (window !== 'anytime') return
    const hasCookeryFamily =
      playerHasCardCapability(context.player, 'fireplaceIdentity', { asType: 'major' }) ||
      playerHasCardCapability(context.player, 'cookingHearthIdentity', { asType: 'major' })
    if (!hasCookeryFamily) return
    return {
      extraExchanges: [exchange],
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [computeExchangesListener],
  prerequisiteCheck: (player) => (player.resources.horse ?? 0) >= 2,
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M107_PotRoastRecipe = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Pot Roast Recipe",
    deck: "M",
    number: 107,
    category: "FOOD_PROVIDER",
    desc: [
        "At any time, you can use your \"Fireplace\" and \"Cooking Hearth\" major improvements to turn 1 <HORSE> into 2 <FOOD>."
    ],
    cost: {},
    prerequisite: "2 Horses",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M107_PotRoastRecipe_impl = M107_PotRoastRecipe.impl
