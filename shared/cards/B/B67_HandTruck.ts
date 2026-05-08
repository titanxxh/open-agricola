import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { spaceHasPlayer } from '../../domain/space'
import type { CardImpl } from '../registry'
import { B67_HandTruck } from '../../cards-display/B/B67_HandTruck'

const CARD_ID = B67_HandTruck.id

const listener: CardListenerRegistration = {
  id: 'B67-hand-truck-before-bake',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['bake-bread'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const accumulationSpaces = context.state.actionSpaces.filter(
      (space) =>
        spaceHasPlayer(space, context.player.id) &&
        Object.values(space.gainPerRound).some(
          (value) => typeof value === 'number' && value > 0,
        ),
    )
    const workerCount = accumulationSpaces.length
    if (workerCount <= 0) return
    return { flow: gainLeaf(CARD_ID, { grain: workerCount }), sourceCard: CARD_ID }
  },
}

const isDoableListener: CardListenerRegistration = {
  id: 'B67-hand-truck-isdoable-bake',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['bake-bread'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.doable) return
    const hasWorkersOnAccumulation = context.state.actionSpaces.some(
      (space) =>
        spaceHasPlayer(space, context.player.id) &&
        Object.values(space.gainPerRound).some(
          (value) => typeof value === 'number' && value > 0,
        ),
    )
    if (!hasWorkersOnAccumulation) return
    return { doable: true }
  },
}

export const B67_HandTruck_impl = {
  listeners: [listener, isDoableListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
