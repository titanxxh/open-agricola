import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { gainLeaf } from '../../helpers/pay-gain-node'
import { getLogicalFields } from '../../helpers/card-field'
import { readCardExtraData, writeCardExtraData } from '../../helpers/card-state'
import { registerAdHocAction } from '../../../actions/helpers/ad-hoc-action-registry'
import { registerHarvestCountModifier } from '../../../actions/helpers/harvest-count-registry'

const CARD_ID = 'CFL029_BirdTrap'

const HARVEST = 'card_CFL029_BirdTrap_harvest'
const SELECTED_HARVEST_FIELD = 'selectedHarvestField'
type HarvestSelection = { round: number; fieldId: string }

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
  resolveChoice: ({ state, player }, choice) => {
    if (!getLogicalFields(player).some((field) => field.id === choice && field.stacks.length > 0))
      return { type: 'fail', errorKey: 'log.actionFail' }
    writeCardExtraData(player, CARD_ID, SELECTED_HARVEST_FIELD, {
      round: state.round,
      fieldId: choice,
    } satisfies HarvestSelection)
    return { type: 'ok' }
  },
})

registerHarvestCountModifier(CARD_ID, ({ state, player, logicalField }) => {
  if (state.roundPhase !== 'field' || !player.minorPlayed.includes(CARD_ID) || !logicalField)
    return
  const selection = readCardExtraData<HarvestSelection>(player, CARD_ID, SELECTED_HARVEST_FIELD)
  if (selection?.round === state.round && selection.fieldId === logicalField.id)
    return { delta: 1, sources: [CARD_ID] }
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
    onEndHarvestFieldPhase: (_state, player) => {
      if (!readCardExtraData<HarvestSelection>(player, CARD_ID, SELECTED_HARVEST_FIELD)) return
      return {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        params: { kind: 'set-extra-data', key: SELECTED_HARVEST_FIELD, value: undefined },
      }
    },
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
      'In the field phase of each harvest, you get 1 <FOOD> and may harvest one additional crop from one of your <FIELD>.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL029.png',
    prerequisite: '1 grain field',
  },
  impl: cardImpl,
})
