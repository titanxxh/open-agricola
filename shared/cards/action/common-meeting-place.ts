import { setFirstPlayer } from '../../actions/effects/first-player'
import type { ActionDefinition } from '../../game/types'
import { wrapOptional } from '../../actions/flow'

export const meetingPlace: ActionDefinition = {
  id: 'meeting-place',
  nameKey: 'actions.meeting-place.name',
  descriptionKey: 'actions.meeting-place.description',
  roundAvailable: 1,
  gainPerRound: {},
  players: [2, 3, 4],
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player }) => {
    setFirstPlayer(state, player)
    state.log.unshift({
      key: 'log.startPlayer',
      params: { player: player.name },
    })
    return { type: 'ok' }
  },
  flow: {
    type: 'seq',
    children: [wrapOptional({ type: 'leaf', actionId: 'minor-improvement' })],
  },
}
