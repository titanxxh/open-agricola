import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'A115_ChiefForester'

const isWoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space.gainPerRound?.wood ?? 0) > 0

// A115 Chief Forester: Each time you use a wood accumulation space, you also get a
// Sow action for exactly 1 field.
// Triggers before collect (same as isBeforeCollectEvent in BGA).
const listener: CardListenerRegistration = {
  id: 'A115-chief-forester-before-collect',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isWoodAccumulationSpace(context.space)) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'sow',
        optional: true,
        sourceCard: CARD_ID,
        actionContext: { max: 1 },
      },
      sourceCard: CARD_ID,
    }
  },
}

export const A115_ChiefForester = new Occupation({
  id: CARD_ID,
  name: 'Chief Forester',
  deck: 'A',
  number: 115,
  category: 'CROP_PROVIDER',
  desc: ['Each time you use a wood accumulation space, you also get a __Sow__ action for exactly 1 field.'],
  cost: {},
  players: '1+',
  newSet: true,
})

export const A115_ChiefForester_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
