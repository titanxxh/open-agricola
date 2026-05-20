import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A146_StorehouseSteward } from '../../cards-display/A/A146_StorehouseSteward'
import { sumResourceMovedFromActionSpace } from '../helpers/event-provenance'

const CARD_ID = A146_StorehouseSteward.id

const isFoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space?.gainPerRound?.food ?? 0) > 0

const listener: CardListenerRegistration = {
  id: 'A146-storehouse-steward-after-collect',
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
    let gain: { stone?: number; reed?: number; clay?: number; wood?: number } | null = null
    if (foodGained === 2) {
      gain = { stone: 1 }
    } else if (foodGained === 3) {
      gain = { reed: 1 }
    } else if (foodGained === 4) {
      gain = { clay: 1 }
    } else if (foodGained === 5) {
      gain = { wood: 1 }
    }
    if (!gain) return
    return { flow: gainLeaf(CARD_ID, gain), sourceCard: CARD_ID }
  },
}

export const A146_StorehouseSteward_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
