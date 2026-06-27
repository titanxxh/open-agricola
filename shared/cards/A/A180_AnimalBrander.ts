import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionFlow } from '../../contract/types'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A180_AnimalBrander'
type AnimalMarketOptionId = 'animal-market-56:sheep' | 'animal-market-56:boar' | 'animal-market-56:cattle'

const isAnimalMarketOptionId = (value: unknown): value is AnimalMarketOptionId =>
  value === 'animal-market-56:sheep' ||
  value === 'animal-market-56:boar' ||
  value === 'animal-market-56:cattle'

const requiredFoodAfterOriginal = (optionId: AnimalMarketOptionId) =>
  optionId === 'animal-market-56:sheep'
    ? 2
    : optionId === 'animal-market-56:cattle'
      ? 2
      : 1

const replayBranch = (optionId: AnimalMarketOptionId): ActionFlow => {
  if (optionId === 'animal-market-56:sheep') return gainLeaf(CARD_ID, { sheep: 1, food: 1 })
  if (optionId === 'animal-market-56:boar') return gainLeaf(CARD_ID, { boar: 1 })
  return {
    type: 'seq',
    children: [
      payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
      gainLeaf(CARD_ID, { cattle: 1 }),
    ],
  }
}

const replayFlow = (optionId: AnimalMarketOptionId): ActionFlow => ({
  type: 'seq',
  optional: true,
  promptKey: 'ui.interactionOptionalAction',
  choiceLabelKey: 'ui.interactionUseCard',
  choiceLabelParams: { cardNameKey: `occupations.${CARD_ID}.name` },
  children: [
    payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
    replayBranch(optionId),
  ],
})

const listener: CardListenerRegistration = {
  id: 'A180-animal-brander-replay-animal-market',
  cardIds: [CARD_ID],
  actions: ['gain'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'animal-market-56') return
    if (context.sourceCard === CARD_ID) return
    const optionId = context.actionContext?.optionId
    if (!isAnimalMarketOptionId(optionId)) return
    if ((context.player.resources.food ?? 0) < requiredFoodAfterOriginal(optionId)) return
    return { flow: replayFlow(optionId), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A180_AnimalBrander = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Animal Brander',
    deck: 'A',
    number: 180,
    category: 'LIVESTOCK_PROVIDER',
    desc: ['Each time you use the "Animal Market" action space, you can pay 1 food to use the same option twice (instead of once).'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const A180_AnimalBrander_impl = A180_AnimalBrander.impl
