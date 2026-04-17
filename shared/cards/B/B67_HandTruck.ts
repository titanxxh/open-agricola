import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { spaceHasPlayer } from '../../game/space'

const CARD_ID = 'B67_HandTruck'

const listener: CardListenerRegistration = {
  id: 'B67-hand-truck-before-bake',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['bake-bread'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
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
    if (!context.player.minorPlayed.includes(CARD_ID)) return
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

registerCardListener(listener)
registerCardListener(isDoableListener)

export const B67_HandTruck = new MinorImprovement({
  id: CARD_ID,
  name: "Hand Truck",
  deck: "B",
  number: 67,
  category: "CROP_PROVIDER",
  desc: ["Each time before you take a __Bake Bread__ action, you also get 1 <GRAIN> for each of your people occupying an accumulation space."],
  cost: {"wood":1},
  newSet: true,
})
