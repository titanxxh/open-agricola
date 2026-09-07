import type { ActionDefinition } from '../../contract/types'
import { deriveCanBeExecutedByFlow, wrapOptional } from '../../actions/flow'

export const meetingPlace: ActionDefinition = {
  id: 'meeting-place',
  nameKey: 'actions.meeting-place.name',
  descriptionKey: 'actions.meeting-place.description',
  rulesKey: 'actions.meeting-place.rules',
  roundAvailable: 1,
  gainPerRound: {},
  players: [2, 3, 4, 5, 6],
  canBeExecutedByPlayer: deriveCanBeExecutedByFlow(),
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'seq',
    children: [
      { type: 'leaf', actionId: 'set-first-player' },
      wrapOptional({ type: 'leaf', actionId: 'improvement', actionContext: { types: ['minor'] } }),
    ],
  },
}
