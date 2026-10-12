import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { fieldOperationFlow } from '../../actions/plans/field-operation'
import type { CardImpl } from '../registry'
import { getLogicalFields } from '../helpers/card-field'

const CARD_ID = 'C018_RollOverPlow'
const anytimeListener: CardListenerRegistration = {
  id: 'C18-roll-over-plow-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  preScoring: true,
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const plantedFields = getLogicalFields(context.player).filter((field) => field.stacks.length > 0)
    if (plantedFields.length < 3) return
    return {
      flow: {
        type: 'seq',
        children: [
          fieldOperationFlow(CARD_ID, { kind: 'discard-all' }, plantedFields.map(field => {
            const slot = [...field.slots].reverse().find(candidate => candidate.stack)!
            return { ...slot.tile, ...(field.sourceCard ? { sourceCard: field.sourceCard, groupKey: field.groupKey, cardFieldSlot: slot.index } : {}) }
          })),
          {
            type: 'leaf',
            actionId: 'plow',
            sourceCard: CARD_ID,
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [anytimeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C018_RollOverPlow = defineMinorCard({
  presentation: { stack: true },
  meta: {
    id: CARD_ID,
    name: 'Roll-Over Plow',
    deck: 'C',
    number: 18,
    category: 'FARM_PLANNER',
    desc: ['At any time, if you have at least 3 planted <FIELD>, you can discard all goods from one of those <FIELD> to plow 1 <FIELD>.'],
    cost: { wood: 2 },
  },
  impl: cardImpl,
})

export const C018_RollOverPlow_impl = C018_RollOverPlow.impl
