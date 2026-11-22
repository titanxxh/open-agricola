import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { getLogicalFields, mutateLogicalFields } from '../../helpers/card-field'
import { registerAdHocAction } from '../../../actions/helpers/ad-hoc-action-registry'

const CARD_ID = 'CFL042_Rainmaker'

const GROW_ACTION = 'card_CFL042_Rainmaker_grow'
const candidates = (player: import('../../../contract/types').PlayerState) =>
  getLogicalFields(player).flatMap((field) => {
    const slot = [...field.slots].reverse().find((entry) => entry.stack)
    return slot && (slot.stack?.kind === 'grain' || slot.stack?.kind === 'vegetable')
      ? [{ field, slot }]
      : []
  })
registerAdHocAction({
  id: GROW_ACTION,
  nameKey: 'actions.selection.name',
  descriptionKey: 'actions.selection.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_state, player) => candidates(player).length > 0,
  execute: ({ player }) => ({
    type: 'request',
    request: {
      kind: 'choice',
      options: candidates(player).map(({ field }) => ({
        value: field.id,
        labelKey: field.sourceCard ? `cards.${field.sourceCard}.name` : 'ui.choicePreviewFieldAt',
        labelParams: { row: field.row + 1, col: field.col + 1 },
      })),
    },
  }),
  resolveChoice: ({ state, player, eventSink }, choice) => {
    const selected = candidates(player).find(({ field }) => field.id === choice)
    if (!selected) return { type: 'fail', errorKey: 'log.actionFail', recoverable: true }
    const result = mutateLogicalFields(state, player, { sourceCard: CARD_ID, eventSink }).grow(
      { fieldId: selected.field.id, slot: selected.slot.index },
      1,
    )
    return result.ok ? { type: 'ok' } : { type: 'fail', errorKey: 'log.actionFail' }
  },
})

const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-improvement',
      cardIds: [CARD_ID],
      actions: ['improvement'],
      phases: ['after'],
      handler: ({ player }) =>
        getLogicalFields(player).some((field) => field.stacks.length > 0)
          ? {
              flow: {
                type: 'leaf',
                actionId: GROW_ACTION,
                sourceCard: CARD_ID,
                optional: true,
              },
            }
          : undefined,
    },
  ],
} satisfies CardImpl

export const CFL042_Rainmaker = defineOccupationCard({
  meta: {
    id: 'CFL042_Rainmaker',
    name: 'Rainmaker',
    deck: 'CFL',
    number: 42,
    players: '1+',
    desc: [
      'Whenever you play or build an improvement, you may add 1 crop of the corresponding type to one of your planted <FIELD>.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL042.png',
  },
  impl: cardImpl,
})
