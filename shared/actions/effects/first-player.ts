import type { ActionDefinition, GameState, PlayerState } from '../../contract/types'

export const setStartPlayer = (state: GameState, player: PlayerState) => {
  state.players.forEach((item) => {
    item.startPlayer = item.id === player.id
  })
}

export const setFirstPlayerAction: ActionDefinition = {
  id: 'set-first-player',
  nameKey: 'actions.set-first-player.name',
  descriptionKey: 'actions.set-first-player.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, eventSink }) => {
    setStartPlayer(state, player)
    eventSink?.emit<'startPlayer.changed'>({
      type: 'startPlayer.changed',
      playerId: player.id,
    })
    return { type: 'ok' }
  },
}
