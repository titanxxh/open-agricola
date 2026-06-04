import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { spaceHasPlayer } from '../../domain/space'
import type { CardImpl } from '../registry'
import { getPlayerBakeRates } from '../helpers/exchange-registry'

const CARD_ID = 'B67_HandTruck'

const listener: CardListenerRegistration = {
  id: 'B67-hand-truck-before-bake',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['bake-bread'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (getPlayerBakeRates(context.player).length === 0) return
    const accumulationSpaces = context.state.actionSpaces.filter(
      (space) =>
        spaceHasPlayer(space, context.player.id) &&
        Object.values(space.gainPerRound).some(
          (value) => typeof value === 'number' && value > 0,
        ),
    )
    const workerCount = accumulationSpaces.length
    if (workerCount <= 0) return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          gainLeaf(CARD_ID, { grain: workerCount }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const isDoableListener: CardListenerRegistration = {
  id: 'B67-hand-truck-isdoable-bake',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['bake-bread'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.doable) return
    if (context.actionContext?.skipBeforeTriggers === true) return
    const hasWorkersOnAccumulation = context.state.actionSpaces.some(
      (space) =>
        spaceHasPlayer(space, context.player.id) &&
        Object.values(space.gainPerRound).some(
          (value) => typeof value === 'number' && value > 0,
        ),
    )
    if (!hasWorkersOnAccumulation) return
    if (getPlayerBakeRates(context.player).length === 0) return
    return { doable: true }
  },
}

const cardImpl = {
  listeners: [listener, isDoableListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B67_HandTruck = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Hand Truck",
    deck: "B",
    number: 67,
    category: "CROP_PROVIDER",
    desc: ["Each time before you take a __Bake Bread__ action, you also get 1 <GRAIN> for each of your people occupying an accumulation space."],
    cost: {"wood":1},
  },
  impl: cardImpl,
})

export const B67_HandTruck_impl = B67_HandTruck.impl
