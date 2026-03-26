import type { ActionDefinition, GameState, PlayerState } from '../../game/types'

export const setStartPlayer = (state: GameState, player: PlayerState) => {
  state.players.forEach((item) => {
    item.startPlayer = item.id === player.id
  })
}

export const setFirstPlayer = (state: GameState, player: PlayerState) =>
  setStartPlayer(state, player)

export const setFirstPlayerAction: ActionDefinition = {
  id: 'set-first-player',
  nameKey: 'actions.noop.name',
  descriptionKey: 'actions.noop.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player }) => {
    setFirstPlayer(state, player)
    state.log.unshift({
      key: 'log.startPlayer',
      params: { player: player.name },
    })
    return { type: 'ok' }
  },
}
