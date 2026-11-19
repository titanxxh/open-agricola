import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { gainLeaf } from '../../helpers/pay-gain-node'
import { getLogicalFields } from '../../helpers/card-field'
import { registerAdHocAction } from '../../../actions/helpers/ad-hoc-action-registry'
import { reap } from '../../../actions/effects/reap'

const CARD_ID = 'CFL029_BirdTrap'

const HARVEST = 'card_CFL029_BirdTrap_harvest'
registerAdHocAction({
  id: HARVEST,
  nameKey: 'actions.reap.name',
  descriptionKey: 'actions.reap.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_state, player) =>
    getLogicalFields(player).some((field) => field.stacks.length > 0),
  execute: ({ player }) => ({
    type: 'request',
    promptKey: 'ui.interactionFlowSelect',
    request: {
      kind: 'choice',
      options: getLogicalFields(player)
        .filter((field) => field.stacks.length > 0)
        .map((field) => ({
          value: field.id,
          labelKey: field.sourceCard ? `cards.${field.sourceCard}.name` : 'ui.choicePreviewFieldAt',
          labelParams: { row: field.row + 1, col: field.col + 1 },
        })),
    },
  }),
  resolveChoice: ({ state, player, eventSink, actionHooks }, choice) => {
    const fields = getLogicalFields(player)
    if (!fields.some((field) => field.id === choice && field.stacks.length > 0))
      return { type: 'fail', errorKey: 'log.actionFail' }
    const harvestCounts = Object.fromEntries(
      fields.map((field) => [
        `${field.row}-${field.col}`,
        { count: field.id === choice ? 1 : 0, sources: [CARD_ID] },
      ]),
    )
    const result = reap(
      state,
      player,
      eventSink,
      { harvestCounts, sourceCard: CARD_ID, trigger: { phase: 'harvest', cardId: CARD_ID } },
      actionHooks,
    )
    return result.reactionFlow ? { type: 'flow', flow: result.reactionFlow } : result
  },
})

const cardImpl = {
  prerequisiteCheck: (player) =>
    getLogicalFields(player).some((field) =>
      field.stacks.some((stack) => stack.kind === 'grain' && stack.remaining > 0),
    ),
  effect: {
    id: CARD_ID,
    onHarvestFieldPhase: () => ({
      type: 'seq',
      children: [
        gainLeaf(CARD_ID, { food: 1 }),
        { type: 'leaf', actionId: HARVEST, sourceCard: CARD_ID, optional: true },
      ],
    }),
  },
} satisfies CardImpl

export const CFL029_BirdTrap = defineMinorCard({
  meta: {
    id: 'CFL029_BirdTrap',
    name: 'Bird Trap',
    deck: 'CFL',
    number: 29,
    cost: {
      wood: 2,
    },
    desc: [
      'In the field phase of each harvest, you get 1 <FOOD> and may harvest one additional crop from one of your fields.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL029.png',
    prerequisite: '1 grain field',
  },
  impl: cardImpl,
})
