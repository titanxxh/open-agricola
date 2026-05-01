import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { readActionSnapshotToken } from '../helpers/action-snapshot'
import type { CardImpl } from '../registry'

const CARD_ID = 'E53_BoarSpear'
const TRACKED_ACTIONS = ['gain', 'collect', 'receive'] as const
const USED_TOKEN_KEY = 'E53UsedActionToken'

const obtainListener: CardListenerRegistration = {
  id: 'E53-boar-spear-after-obtain',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: [...TRACKED_ACTIONS],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!(TRACKED_ACTIONS as readonly string[]).includes(context.actionId)) return

    const result = context.result
    const obtainedBoar = result?.type === 'ok' ? (result.resourcesGained?.boar ?? 0) : 0
    if (obtainedBoar <= 0) return

    if (context.state.roundPhase === 'breeding') return

    const token = readActionSnapshotToken(context.player)
    if (token === undefined) return
    const used = readCardExtraData<number>(context.player, CARD_ID, USED_TOKEN_KEY)
    if (used === token) return
    writeCardExtraData(context.player, CARD_ID, USED_TOKEN_KEY, token)

    return {
      flow: {
        type: 'seq',
        optional: true,
        choiceLabelKey: 'cards.E53_BoarSpear.choice',
        children: [
          {
            type: 'leaf',
            actionId: 'exchange',
            sourceCard: CARD_ID,
            actionContext: { tradeIds: ['E53_BoarSpear'] },
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const E53_BoarSpear = new MinorImprovement({
  id: CARD_ID,
  name: 'Boar Spear',
  deck: 'E',
  number: 53,
  category: 'FOOD',
  desc: ['Each time you get at least 1 <PIG> outside of the breeding phase of a harvest, you can immediately turn them into 4 <FOOD> each.'],
  vp: 1,
  cost: { wood: 1, stone: 1 },
  exchanges: [
    // E53 trade is surfaced both via the anytime cookery window (legacy
    // behaviour preserved from the hardcoded `cookeryTrades` table) and via
    // listener-driven `tradeIds: ['E53_BoarSpear']`. BGA narrows visibility
    // to the listener-driven path only, but matching that requires UI churn
    // outside Sprint 6a; tracked under simplifications.
    { from: { boar: 1 }, to: { food: 4 }, sourceId: CARD_ID, triggers: ['anytime'] },
  ],
})

export const E53_BoarSpear_impl = {
  listeners: [obtainListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
