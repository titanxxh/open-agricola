import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption } from '../../contract/types'
import { gainLeaf } from '../helpers/pay-gain-node'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../../actions/helpers/placement-constants'
import { isSpaceOccupied } from '../../domain/space'
import type { CardImpl } from '../registry'

const CARD_ID = 'D112_YoungFarmer'
const duringListener: CardListenerRegistration = {
  id: 'D112-young-farmer-during-place-farmer',
  cardIds: [CARD_ID],
  phases: ['during' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'major-improvement') return
    return { flow: gainLeaf(CARD_ID, { grain: 1 }), sourceCard: CARD_ID }
  },
}

const afterListener: CardListenerRegistration = {
  id: 'D112-young-farmer-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
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

const computeArgsListener: CardListenerRegistration = {
  id: 'D112-young-farmer-compute-args-place-farmer',
  cardIds: [CARD_ID],
  phases: ['computeArgs' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const majorSpace = context.state.actionSpaces.find((s) => s.id === 'major-improvement')
    if (!majorSpace) return
    // Only add if the space is occupied (if empty, it's already available normally)
    if (!isSpaceOccupied(majorSpace)) return
    if (!majorSpace.canBeExecutedByPlayer(context.state, context.player)) return
    const extraOptions: ActionChoiceOption[] = [
      {
        value: `${OCCUPIED_SPACE_CHOICE_PREFIX}major-improvement`,
        labelKey: majorSpace.nameKey,
        sourceCard: CARD_ID,
      },
    ]
    return { extraOptions, sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [duringListener, afterListener, computeArgsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D112_YoungFarmer = defineOccupationCard({
  meta: {
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
  },
  impl: cardImpl,
})

export const D112_YoungFarmer_impl = D112_YoungFarmer.impl
