import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'A24_ThreshingBoard'

const TRIGGER_SPACES = new Set(['farmland', 'cultivation'])

// A24 Threshing Board: Each time you use the Farmland or Cultivation action space,
// you get an additional Bake Bread action.
const listener: CardListenerRegistration = {
  id: 'A24-threshing-board-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || !TRIGGER_SPACES.has(context.space.id)) return
    return {
      followUpActions: [{ actionId: 'bake-bread', sourceCard: CARD_ID }],
      sourceCard: CARD_ID,
    }
  },
}

export const A24_ThreshingBoard = new MinorImprovement({
  id: CARD_ID,
  name: 'Threshing Board',
  deck: 'A',
  number: 24,
  category: 'ACTIONS_BOOSTER',
  desc: ['Each time you use the __Farmland__ or __Cultivation__ action space, you get an additional __Bake Bread__ action.'],
  cost: { wood: 1 },
  vp: 1,
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
})

export const A24_ThreshingBoard_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
