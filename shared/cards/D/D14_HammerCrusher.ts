import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { incCounter } from '../__stubs__/helpers'
import { getRenovation } from '../../actions/effects/renovation'

const CARD_ID = 'D14_HammerCrusher'

const listener: CardListenerRegistration = {
  id: 'D14-hammer-crusher-before-renovate',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    if (context.player.houseType !== 'clay') return
    incCounter(context.player, CARD_ID, 'triggerCount')
    return {
      flow: {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'gain', params: { clay: 2, reed: 1 } },
          { type: 'leaf', actionId: 'construct', optional: true, promptKey: 'ui.interactionHammerCrusherBuild' },
        ],
      },
      logKey: 'log.cardEffectGain',
      logParams: { gain: { clay: 2, reed: 1 }, cardId: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

const isDoableListener: CardListenerRegistration = {
  id: 'D14-hammer-crusher-isdoable-renovate',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    if (context.player.houseType !== 'clay') return
    const renovation = getRenovation(context.player)
    if (!renovation) return
    const boostedResources = {
      ...context.player.resources,
      clay: context.player.resources.clay + 2,
      reed: context.player.resources.reed + 1,
    }
    const canAfford =
      (boostedResources.stone ?? 0) >= (renovation.cost.stone ?? 0) &&
      (boostedResources.reed ?? 0) >= (renovation.cost.reed ?? 0)
    return canAfford ? { doable: true } : undefined
  },
}

registerCardListener(listener)
registerCardListener(isDoableListener)

export const D14_HammerCrusher = new MinorImprovement({
  id: CARD_ID,
  name: "Hammer Crusher",
  deck: "D",
  number: 14,
  category: "FARM_PLANNER",
  desc: ["Immediately before you renovate to stone, you get 2 <CLAY> and 1 <REED> and you can take a __Build Rooms__ action."],
  cost: {"wood":1},
})
