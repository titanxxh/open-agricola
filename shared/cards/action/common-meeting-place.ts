import type { ActionDefinition } from '../../contract/types'
import { wrapOptional } from '../../actions/flow'

export const meetingPlace: ActionDefinition = {
  id: 'meeting-place',
  nameKey: 'actions.meeting-place.name',
  descriptionKey: 'actions.meeting-place.description',
  roundAvailable: 1,
  gainPerRound: {},
  players: [2, 3, 4],
  canBeExecutedByPlayer: () => true,
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'seq',
    children: [
      { type: 'leaf', actionId: 'set-first-player' },
      wrapOptional({ type: 'leaf', actionId: 'improvement', actionContext: { types: ['minor'] } }),
    ],
  },
}
