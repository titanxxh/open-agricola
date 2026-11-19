import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { getLogicalFields, mutateLogicalFields } from '../../helpers/card-field'
import { registerAdHocAction } from '../../../actions/helpers/ad-hoc-action-registry'
import { payLeaf } from '../../helpers/pay-gain-node'
import type { PlayerState } from '../../../contract/types'

const CARD_ID = 'CFL001_FarmCart'

const MIX = 'card_CFL001_FarmCart_choose'
const PLANT = 'card_CFL001_FarmCart_plant'
const candidates = (player: PlayerState) =>
  getLogicalFields(player).flatMap((field) => {
    const crops = new Set(field.stacks.map((stack) => stack.kind))
    if (crops.size !== 1) return []
    const original = [...crops][0]
    if (original !== 'grain' && original !== 'vegetable') return []
    const crop = original === 'grain' ? ('vegetable' as const) : ('grain' as const)
    const slot = field.slots.find((slot) => slot.stack !== null)?.index ?? 0
    return player.resources[crop] > 0 ? [{ field, crop, slot }] : []
  })
registerAdHocAction({
  id: MIX,
  nameKey: `cards.${CARD_ID}.name`,
  descriptionKey: `cards.${CARD_ID}.name`,
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_state, player) => candidates(player).length > 0,
  execute: ({ player }) => ({
    type: 'request',
    promptKey: 'ui.interactionFlowSelect',
    request: {
      kind: 'choice',
      options: candidates(player).map(({ field }) => ({
        value: field.id,
        labelKey: field.sourceCard ? `cards.${field.sourceCard}.name` : 'ui.choicePreviewFieldAt',
        labelParams: { row: field.row + 1, col: field.col + 1 },
      })),
    },
  }),
  resolveChoice: ({ player }, choice) => {
    const selected = candidates(player).find((candidate) => candidate.field.id === choice)
    if (!selected) return { type: 'fail', errorKey: 'log.actionFail' }
    return {
      type: 'flow',
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { [selected.crop]: 1 } }),
          {
            type: 'leaf',
            actionId: PLANT,
            sourceCard: CARD_ID,
            params: { fieldId: selected.field.id, slot: selected.slot, crop: selected.crop },
          },
          { type: 'leaf', actionId: MIX, sourceCard: CARD_ID, optional: true },
        ],
      },
    }
  },
})
registerAdHocAction({
  id: PLANT,
  nameKey: 'actions.sow.name',
  descriptionKey: 'actions.sow.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, params, eventSink }) => {
    if (
      typeof params?.fieldId !== 'string' ||
      (params.crop !== 'grain' && params.crop !== 'vegetable')
    )
      return { type: 'fail', errorKey: 'log.actionFail' }
    const result = mutateLogicalFields(state, player, {
      sourceCard: CARD_ID,
      eventSink,
      allowNonSowCrop: true,
    }).addCompanion(
      { fieldId: params.fieldId, slot: typeof params.slot === 'number' ? params.slot : 0 },
      params.crop,
      1,
    )
    return result.ok ? { type: 'ok' } : { type: 'fail', errorKey: 'log.actionFail' }
  },
})

const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-after-sow',
      cardIds: [CARD_ID],
      actions: ['sow'],
      phases: ['after'],
      handler: ({ player }) =>
        candidates(player).length
          ? { flow: { type: 'leaf', actionId: MIX, sourceCard: CARD_ID, optional: true } }
          : undefined,
    },
    {
      id: CARD_ID + '-mixed-sow-only',
      cardIds: [CARD_ID],
      actions: ['sow'],
      phases: ['computeReplace'],
      handler: (context) => {
        if (
          !candidates(context.player).length ||
          context.actionContext?.checkedReplaceAction === true
        )
          return
        return {
          decline: true,
          sourceCard: CARD_ID,
          alternativeFlow: {
            type: 'leaf',
            actionId: MIX,
            sourceCard: CARD_ID,
            choiceLabelKey: `cards.${CARD_ID}.name`,
          },
        }
      },
    },
    {
      id: CARD_ID + '-mixed-sow-doable',
      cardIds: [CARD_ID],
      actions: ['sow'],
      phases: ['isDoable'],
      handler: ({ player, actionContext }) =>
        actionContext?.checkedReplaceAction !== true && candidates(player).length
          ? { doable: true }
          : undefined,
    },
  ],
} satisfies CardImpl

export const CFL001_FarmCart = defineMinorCard({
  meta: {
    id: 'CFL001_FarmCart',
    name: 'Farm Cart',
    deck: 'CFL',
    number: 1,
    cost: {
      reed: 1,
    },
    desc: [
      'Whenever you sow, you may plant one crop from your supply of the opposite type in each grain or vegetable field, including a card field. Each field may have only one pile of each type and retains its original field type.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL001.png',
  },
  impl: cardImpl,
})
