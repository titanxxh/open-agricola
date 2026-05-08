import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionDefinition } from '../../contract/types'
import { fieldTopStack, fieldTotalRemaining } from '../../domain/field'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import type { CardImpl } from '../registry'

const CARD_ID = 'C69_LandConsolidation'
const SWAP_ACTION_ID = 'card_C69_LandConsolidation_swap'

const swapFieldGrainToVegAction: ActionDefinition = {
  id: SWAP_ACTION_ID,
  nameKey: 'actions.swap-field-grain-to-veg.name',
  descriptionKey: 'actions.swap-field-grain-to-veg.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, params, sourceCard }) => {
    const row = (params as { row?: number } | undefined)?.row
    const col = (params as { col?: number } | undefined)?.col
    if (row === undefined || col === undefined) {
      return { type: 'fail', logKey: 'log.actionFail' }
    }
    const field = player.fields.find((f) => f.row === row && f.col === col)
    if (!field || field.stacks.length !== 1) {
      return { type: 'fail', logKey: 'log.actionFail' }
    }
    const stack = field.stacks[0]
    if (!stack || stack.kind !== 'grain' || stack.remaining !== 3) {
      return { type: 'fail', logKey: 'log.actionFail' }
    }
    stack.kind = 'vegetable'
    stack.remaining = 1
    return {
      type: 'ok',
      logKey: 'log.cardEffectGain',
      logParams: { gain: { vegetable: 1 }, cardId: sourceCard },
    }
  },
}
registerAdHocAction(swapFieldGrainToVegAction)

/**
 * C69 Land Consolidation (MinorImprovement, C, 69)
 * BGA: At any time, if you have a grain field with exactly 3 sown grain,
 * swap the grain on that field for 1 vegetable (remaining=1) on the same field.
 * No supply cost, no per-round limit — trigger is field-local.
 */
const anytimeListener: CardListenerRegistration = {
  id: 'C69-land-consolidation-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const qualifying = context.player.fields.filter((f) => {
      const top = fieldTopStack(f)
      return !!top && top.kind === 'grain' && top.remaining === 3 && fieldTotalRemaining(f) === 3
    })
    if (qualifying.length === 0) return

    if (qualifying.length === 1) {
      const field = qualifying[0]!
      return {
        flow: {
          type: 'leaf',
          actionId: SWAP_ACTION_ID,
          params: { row: field.row, col: field.col },
          sourceCard: CARD_ID,
        },
        sourceCard: CARD_ID,
        labelKey: 'cards.C69_LandConsolidation.anytime',
      }
    }

    return {
      flow: {
        type: 'xor',
        children: qualifying.map((field) => ({
          type: 'leaf' as const,
          actionId: SWAP_ACTION_ID,
          params: { row: field.row, col: field.col },
          sourceCard: CARD_ID,
          choiceLabelKey: 'ui.interactionFieldChoice',
          choiceLabelParams: { row: field.row, col: field.col },
        })),
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.C69_LandConsolidation.anytime',
    }
  },
}

export const C69_LandConsolidation = new MinorImprovement({
  id: CARD_ID,
  name: 'Land Consolidation',
  deck: 'C',
  number: 69,
  category: 'CROP_PROVIDER',
  desc: [
    'At any time, if you have a grain field with exactly 3 sown <GRAIN>, you can exchange the <GRAIN> on the field for 1 <VEGETABLE> on the field.',
  ],
  cost: {},
})

export const C69_LandConsolidation_impl = {
  listeners: [anytimeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
