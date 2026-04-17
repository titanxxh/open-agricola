import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption } from '../../game/types'
import { gainLeaf } from '../helpers/pay-gain-node'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../../actions/effects/place-farmer'
import { isSpaceOccupied } from '../../game/space'

const CARD_ID = 'D112_YoungFarmer'

// D112 Young Farmer: Each time you use the Major Improvement action space,
// you also get 1 grain and, afterward, you can take a Sow action.
// BGA also adds Major Improvement to available spaces via computeArgs (even if occupied).

// During place-farmer on major-improvement → gain 1 grain
const duringListener: CardListenerRegistration = {
  id: 'D112-young-farmer-during-place-farmer',
  cardIds: [CARD_ID],
  phases: ['during' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (context.space?.id !== 'major-improvement') return
    return { flow: gainLeaf(CARD_ID, { grain: 1 }), sourceCard: CARD_ID }
  },
}

// After place-farmer on major-improvement → optional sow
const afterListener: CardListenerRegistration = {
  id: 'D112-young-farmer-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (context.space?.id !== 'major-improvement') return
    return {
      flow: {
        type: 'leaf',
        actionId: 'sow',
        optional: true,
        sourceCard: CARD_ID,
      },
      sourceCard: CARD_ID,
    }
  },
}

// ComputeArgs: add Major Improvement as an available space (even if occupied)
const computeArgsListener: CardListenerRegistration = {
  id: 'D112-young-farmer-compute-args-place-farmer',
  cardIds: [CARD_ID],
  phases: ['computeArgs' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    const majorSpace = context.state.actionSpaces.find((s) => s.id === 'major-improvement')
    if (!majorSpace) return
    // Only add if the space is occupied (if empty, it's already available normally)
    if (!isSpaceOccupied(majorSpace)) return
    if (!majorSpace.canBeExecutedByPlayer(context.state, context.player)) return
    const extraOptions: ActionChoiceOption[] = [
      {
        value: `${OCCUPIED_SPACE_CHOICE_PREFIX}major-improvement`,
        labelKey: majorSpace.nameKey,
      },
    ]
    return { extraOptions, sourceCard: CARD_ID }
  },
}

registerCardListener(duringListener)
registerCardListener(afterListener)
registerCardListener(computeArgsListener)

export const D112_YoungFarmer = new Occupation({
  id: CARD_ID,
  name: 'Young Farmer',
  deck: 'D',
  number: 112,
  category: 'CROP_PROVIDER',
  desc: [
    'Each time you use the __Major Improvement__ action space, you also get 1 <GRAIN> and, afterward, you can take a __Sow__ action.',
  ],
  cost: {},
  players: '1+',
  newSet: true,
})
