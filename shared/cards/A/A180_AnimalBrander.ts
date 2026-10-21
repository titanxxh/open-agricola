import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionFlow, Resource } from '../../contract/types'
import type { ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A180_AnimalBrander'
type AnimalMarketOptionId = 'animal-market-56:sheep' | 'animal-market-56:boar' | 'animal-market-56:cattle'

const isAnimalMarketOptionId = (value: unknown): value is AnimalMarketOptionId =>
  value === 'animal-market-56:sheep' ||
  value === 'animal-market-56:boar' ||
  value === 'animal-market-56:cattle'

const requiredFoodAfterOriginal = (optionId: AnimalMarketOptionId) =>
  optionId === 'animal-market-56:cattle' ? 2 : 1

const replayBranch = (optionId: AnimalMarketOptionId, spaceId: string): ActionFlow => {
  const gain = (resources: Partial<Resource>): ActionFlow => ({
    type: 'leaf', actionId: 'gain', sourceCard: CARD_ID, params: resources,
    actionContext: { sourceLocation: { kind: 'actionSpace', spaceId } },
  })
  if (optionId === 'animal-market-56:sheep') return gain({ sheep: 1, food: 1 })
  if (optionId === 'animal-market-56:boar') return gain({ boar: 1 })
  return {
    type: 'seq',
    children: [
      payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
      gain({ cattle: 1 }),
    ],
  }
}

const replayFlow = (optionId: AnimalMarketOptionId, spaceId: string): ActionFlow => ({
  type: 'seq',
  optional: true,
  promptKey: 'ui.interactionOptionalAction',
  choiceLabelKey: 'ui.interactionUseCard',
  choiceLabelParams: { cardNameKey: `cards.${CARD_ID}.name` },
  children: [
    payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
    replayBranch(optionId, spaceId),
  ],
})

const listener: CardListenerRegistration = {
  id: 'A180-animal-brander-replay-animal-market',
  cardIds: [CARD_ID],
  actionSpaces: 'all',
  phases: ['after'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'animal-market-56') return
    if (context.sourceCard === CARD_ID) return
    const optionId = context.actionContext?.optionId
    if (!isAnimalMarketOptionId(optionId)) return
    if ((context.player.resources.food ?? 0) < requiredFoodAfterOriginal(optionId)) return
    return { flow: replayFlow(optionId, context.space.id), sourceCard: CARD_ID }
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
    desc: ['Each time you use the __Animal Market__ action space, you can pay 1 <FOOD> to use the same option twice (instead of once).'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const A180_AnimalBrander_impl = A180_AnimalBrander.impl
