import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { sumResourceMovedFromActionSpace } from '../helpers/event-provenance'

const CARD_ID = 'A103_Portmonger'

const isFoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space?.gainPerRound?.food ?? 0) > 0

const listener: CardListenerRegistration = {
  id: 'A103-portmonger-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isFoodAccumulationSpace(context.space)) return
    const spaceId = context.space?.id
    const foodGained = sumResourceMovedFromActionSpace(
      context.actionEvents ?? context.transactionEvents,
      'food',
      (event) =>
        event.from.kind === 'actionSpace' &&
        event.from.spaceId === spaceId &&
        event.to.kind === 'player' &&
        event.to.playerId === context.player.id,
    )
    if (foodGained <= 0) return
    let gain: { vegetable?: number; grain?: number; reed?: number }
    if (foodGained === 1) {
      gain = { vegetable: 1 }
    } else if (foodGained === 2) {
      gain = { grain: 1 }
    } else {
      gain = { reed: 1 }
    }
    return { flow: gainLeaf(CARD_ID, gain), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A103_Portmonger = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Portmonger',
    deck: 'A',
    number: 103,
    category: 'GOODS_PROVIDER',
    desc: ['Each time you take 1/2/3+ <FOOD> from a food accumulation space, you also get 1 <VEGETABLE>/<GRAIN>/<REED>.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const A103_Portmonger_impl = A103_Portmonger.impl
