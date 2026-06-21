import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionFlow } from '../../contract/types'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A180_AnimalBrander'

const sheepBranch = (): ActionFlow => ({
  type: 'seq',
  choiceLabelKey: 'actions.animal-market-56.option-sheep',
  children: [
    payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
    { type: 'leaf', actionId: 'gain', params: { sheep: 1, food: 1 }, sourceCard: CARD_ID },
    { type: 'leaf', actionId: 'gain', params: { sheep: 1, food: 1 }, sourceCard: CARD_ID },
  ],
})

const boarBranch = (): ActionFlow => ({
  type: 'seq',
  choiceLabelKey: 'actions.animal-market-56.option-boar',
  children: [
    payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
    { type: 'leaf', actionId: 'gain', params: { boar: 1 }, sourceCard: CARD_ID },
    { type: 'leaf', actionId: 'gain', params: { boar: 1 }, sourceCard: CARD_ID },
  ],
})

const listener: CardListenerRegistration = {
  id: 'A180-animal-brander-replace-animal-market',
  cardIds: [CARD_ID],
  actions: ['gain', 'pay'],
  phases: ['computeReplace' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'animal-market-56') return
    if (context.actionContext?.checkedReplaceAction === true) return
    if ((context.player.resources.food ?? 0) < 1) return
    const params = context.params ?? {}
    if (context.actionId === 'gain' && params.sheep === 1 && params.food === 1) {
      return { decline: true, sourceCard: CARD_ID, alternativeFlow: sheepBranch() }
    }
    if (context.actionId === 'gain' && params.boar === 1) {
      return { decline: true, sourceCard: CARD_ID, alternativeFlow: boarBranch() }
    }
    if (context.actionId === 'pay' && params.food === 1) {
      if ((context.player.resources.food ?? 0) < 3) return
      return {
        decline: true,
        sourceCard: CARD_ID,
        alternativeFlow: {
          type: 'seq',
          choiceLabelKey: 'actions.animal-market-56.option-cattle',
          children: [
            payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
            { type: 'leaf', actionId: 'pay', params: { food: 1 }, sourceCard: CARD_ID },
            { type: 'leaf', actionId: 'gain', params: { cattle: 1 }, sourceCard: CARD_ID },
            { type: 'leaf', actionId: 'pay', params: { food: 1 }, sourceCard: CARD_ID },
            { type: 'leaf', actionId: 'gain', params: { cattle: 1 }, sourceCard: CARD_ID },
          ],
        },
      }
    }
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
